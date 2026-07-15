import "server-only";

import { ok, err } from "@/core/result";
import { ErrorCode } from "@/core/errors";
import { writeAudit, AuditAction } from "@/core/audit";
import { memberLedger } from "@/core/ledger";
import { formatMoney, potForCycle } from "@/core/money";

/**
 * Seats (shares) in a committee.
 *
 * The central idea: a SEAT is the unit, not a member. One member may hold several.
 * They pay once per seat each cycle and are eligible for the pot once per seat, so
 * a 3-seat member in an 8-seat committee pays 3x every cycle and wins 3 of the 8
 * cycles.
 */

/** The full roster, with each seat's money position. */
export async function listSeats(db, committeeId, now = new Date()) {
  const committee = await db.committee.findUnique({
    where: { id: committeeId },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      contributionMinor: true,
      currency: true,
      currencyExponent: true,
      totalSeats: true,
      startDate: true,
      drawFrequency: true,
      drawDay: true,
      gracePeriodDays: true,
      lateFeeType: true,
      lateFeeFlatMinor: true,
      lateFeePercentBps: true,
    },
  });

  if (!committee) return err(ErrorCode.NOT_FOUND, "That committee no longer exists.");

  const [seats, draws, payments] = await Promise.all([
    db.committeeMember.findMany({
      where: { committeeId, deletedAt: null },
      select: {
        id: true,
        position: true,
        status: true,
        joinedAt: true,
        member: { select: { id: true, fullName: true, phone: true, photoUrl: true } },
      },
      orderBy: { position: "asc" },
    }),
    db.draw.findMany({
      where: { committeeId },
      select: { cycleNumber: true, winnerCommitteeMemberId: true, payoutMinor: true },
    }),
    db.payment.findMany({
      where: { committeeId },
      select: { committeeMemberId: true, cycleNumber: true, amountMinor: true },
    }),
  ]);

  const wonBySeat = new Map(draws.map((d) => [d.winnerCommitteeMemberId, d]));

  const paymentsBySeat = new Map();
  for (const p of payments) {
    const list = paymentsBySeat.get(p.committeeMemberId) ?? [];
    list.push(p);
    paymentsBySeat.set(p.committeeMemberId, list);
  }

  // How many seats each member holds — so the UI can say "2 of 3 seats" rather
  // than listing the same name three times with no explanation.
  const seatsPerMember = new Map();
  for (const s of seats) {
    seatsPerMember.set(s.member.id, (seatsPerMember.get(s.member.id) ?? 0) + 1);
  }

  const money = (v) => formatMoney(v, committee.currency, committee.currencyExponent);

  const rows = seats.map((seat) => {
    const ledger = memberLedger(committee, paymentsBySeat.get(seat.id) ?? [], now);
    const won = wonBySeat.get(seat.id);

    return {
      id: seat.id,
      position: seat.position,
      status: seat.status,
      joinedAt: seat.joinedAt.toISOString(),

      memberId: seat.member.id,
      memberName: seat.member.fullName,
      memberPhone: seat.member.phone,
      seatsHeldByMember: seatsPerMember.get(seat.member.id) ?? 1,

      // "Received Pot?" — derived from Draw, never stored. See the schema note.
      hasReceived: Boolean(won),
      receivedInCycle: won?.cycleNumber ?? null,
      receivedDisplay: won ? money(won.payoutMinor) : null,

      // Payment status + remaining installments, straight off the ledger.
      paidDisplay: money(ledger.totalPaid),
      outstandingDisplay: money(ledger.totalOutstanding),
      hasArrears: ledger.totalOutstanding > 0n,
      remainingInstallments: ledger.remainingInstallments,
      cyclesPaid: ledger.cyclesPaid,
      isCurrent: ledger.isCurrent,
    };
  });

  const uniqueMembers = new Set(seats.map((s) => s.member.id)).size;
  const potMinor = potForCycle(committee.contributionMinor, committee.totalSeats);

  return ok({
    committee: {
      id: committee.id,
      name: committee.name,
      description: committee.description,
      status: committee.status,
      totalSeats: committee.totalSeats,
      contributionDisplay: money(committee.contributionMinor),
      potDisplay: money(potMinor),
      currency: committee.currency,
    },
    seats: rows,
    seatsTaken: seats.length,
    seatsOpen: Math.max(0, committee.totalSeats - seats.length),
    uniqueMembers,
    drawsRun: draws.length,
  });
}

/**
 * Give a member one or more seats.
 *
 * Seats get the lowest free positions. Positions are unique per committee, so
 * this is done inside a transaction — two organisers assigning at once would
 * otherwise both compute the same "next free" number and one would fail.
 */
export async function assignSeats(db, actor, { committeeId, memberId, seatCount }) {
  const committee = await db.committee.findUnique({
    where: { id: committeeId },
    select: { id: true, name: true, totalSeats: true, status: true, deletedAt: true },
  });

  if (!committee || committee.deletedAt) {
    return err(ErrorCode.NOT_FOUND, "That committee no longer exists.");
  }
  if (committee.status === "COMPLETED" || committee.status === "CANCELLED") {
    return err(
      ErrorCode.CONFLICT,
      `“${committee.name}” is ${committee.status.toLowerCase()} — its roster is closed.`
    );
  }

  const member = await db.member.findUnique({
    where: { id: memberId },
    select: { id: true, fullName: true, deletedAt: true, status: true },
  });

  if (!member || member.deletedAt) {
    return err(ErrorCode.NOT_FOUND, "That member no longer exists.");
  }
  if (member.status !== "ACTIVE") {
    return err(
      ErrorCode.CONFLICT,
      `${member.fullName} is ${member.status.toLowerCase()} and can't join a committee.`
    );
  }

  try {
    const created = await db.$transaction(async (tx) => {
      // Lock the committee so concurrent assignments serialise rather than racing
      // for the same seat numbers.
      await tx.$queryRaw`SELECT id FROM "Committee" WHERE id = ${committeeId} FOR UPDATE`;

      const existing = await tx.committeeMember.findMany({
        where: { committeeId, deletedAt: null },
        select: { position: true },
        orderBy: { position: "asc" },
      });

      const free = committee.totalSeats - existing.length;
      if (seatCount > free) {
        throw new SeatError(
          ErrorCode.CONFLICT,
          free === 0
            ? `“${committee.name}” is full — all ${committee.totalSeats} seats are taken.`
            : `Only ${free} seat${free === 1 ? "" : "s"} left; you asked for ${seatCount}.`
        );
      }

      // Once a draw has happened the roster is settled: adding a seat mid-way would
      // change the pot everyone already contributed to and dilute the odds of
      // members who have already been drawn against.
      const drawsRun = await tx.draw.count({ where: { committeeId } });
      if (drawsRun > 0) {
        throw new SeatError(
          ErrorCode.CONFLICT,
          "Draws have already started, so the roster can't change. The pot and everyone's odds were fixed when the first draw ran."
        );
      }

      const taken = new Set(existing.map((e) => e.position));
      const positions = [];
      for (let p = 1; positions.length < seatCount; p++) {
        if (!taken.has(p)) positions.push(p);
      }

      const rows = await Promise.all(
        positions.map((position) =>
          tx.committeeMember.create({
            data: { committeeId, memberId, position, status: "ACTIVE" },
            select: { id: true, position: true },
          })
        )
      );

      await writeAudit(tx, {
        action: AuditAction.COMMITTEE_ASSIGN_MEMBER,
        actorUserId: actor.userId,
        entityType: "Committee",
        entityId: committeeId,
        after: {
          memberId,
          memberName: member.fullName,
          seatCount,
          positions,
        },
      });

      return rows;
    });

    return ok({ seats: created, memberName: member.fullName });
  } catch (error) {
    if (error instanceof SeatError) return err(error.code, error.message);
    if (error?.code === "P2002") {
      return err(
        ErrorCode.CONFLICT,
        "Someone just took that seat. Refresh and try again."
      );
    }
    throw error;
  }
}

/**
 * Remove a seat.
 *
 * Refused once the seat has money or a win against it: removing it would orphan
 * payments and rewrite history. Soft delete, so the seat's record survives.
 */
export async function removeSeat(db, actor, { seatId }) {
  const seat = await db.committeeMember.findUnique({
    where: { id: seatId },
    select: {
      id: true,
      position: true,
      committeeId: true,
      member: { select: { fullName: true } },
    },
  });

  if (!seat) return err(ErrorCode.NOT_FOUND, "That seat no longer exists.");

  const [paymentCount, won] = await Promise.all([
    db.payment.count({ where: { committeeMemberId: seatId } }),
    db.draw.findFirst({ where: { winnerCommitteeMemberId: seatId }, select: { cycleNumber: true } }),
  ]);

  if (won) {
    return err(
      ErrorCode.CONFLICT,
      `Seat #${seat.position} already received the pot in cycle ${won.cycleNumber}. It can't be removed — that would erase a payout that actually happened.`
    );
  }
  if (paymentCount > 0) {
    return err(
      ErrorCode.CONFLICT,
      `Seat #${seat.position} has ${paymentCount} payment${paymentCount === 1 ? "" : "s"} recorded against it. Reverse those first if they were a mistake.`
    );
  }

  await db.$transaction(async (tx) => {
    const removed = await tx.committeeMember.update({
      where: { id: seatId },
      data: { deletedAt: new Date(), status: "LEFT" },
    });

    await writeAudit(tx, {
      action: AuditAction.COMMITTEE_ASSIGN_MEMBER,
      actorUserId: actor.userId,
      entityType: "CommitteeMember",
      entityId: seatId,
      before: seat,
      after: { removed: true, ...removed },
    });
  });

  return ok({ id: seatId });
}

class SeatError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

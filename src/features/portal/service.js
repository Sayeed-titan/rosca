import "server-only";

import { formatMoney, potForCycle } from "@/core/money";
import { memberLedger } from "@/core/ledger";
import { cycleDueDate } from "@/core/cycles";

/**
 * The member's own view.
 *
 * Everything here is scoped to the Member row linked to the signed-in User. A
 * MEMBER role has no business seeing anyone else's ledger, and the query starts
 * from their own userId rather than accepting a memberId parameter — so there's
 * no id to tamper with.
 */
export async function getPortalData(db, userId, now = new Date()) {
  const member = await db.member.findFirst({
    where: { userId, deletedAt: null },
    select: { id: true, fullName: true, phone: true, email: true, joiningDate: true },
  });

  // A User with a login but no linked Member — e.g. a manager who isn't in any
  // committee themselves. Not an error, just nothing to show.
  if (!member) return null;

  const seats = await db.committeeMember.findMany({
    where: { memberId: member.id, deletedAt: null },
    select: {
      id: true,
      position: true,
      committee: {
        select: {
          id: true,
          name: true,
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
          _count: { select: { members: { where: { deletedAt: null } }, draws: true } },
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  if (seats.length === 0) {
    return { member: toMemberSummary(member), committees: [] };
  }

  const seatIds = seats.map((s) => s.id);
  const [payments, wins] = await Promise.all([
    db.payment.findMany({
      where: { committeeMemberId: { in: seatIds } },
      select: {
        id: true,
        committeeMemberId: true,
        cycleNumber: true,
        amountMinor: true,
        lateFeeMinor: true,
        kind: true,
        method: true,
        paidAt: true,
        referenceNumber: true,
        receipt: { select: { id: true, receiptNumber: true } },
      },
      orderBy: { paidAt: "desc" },
    }),
    db.draw.findMany({
      where: { winnerCommitteeMemberId: { in: seatIds } },
      select: {
        winnerCommitteeMemberId: true,
        cycleNumber: true,
        drawnAt: true,
        payoutMinor: true,
      },
    }),
  ]);

  const paymentsBySeat = new Map();
  for (const p of payments) {
    const list = paymentsBySeat.get(p.committeeMemberId) ?? [];
    list.push(p);
    paymentsBySeat.set(p.committeeMemberId, list);
  }
  const winBySeat = new Map(wins.map((w) => [w.winnerCommitteeMemberId, w]));

  const committees = seats.map((seat) => {
    const c = seat.committee;
    const fmt = (v) => formatMoney(v, c.currency, c.currencyExponent);
    const seatPayments = paymentsBySeat.get(seat.id) ?? [];
    const ledger = memberLedger(c, seatPayments, now);
    const win = winBySeat.get(seat.id);
    const potMinor = potForCycle(c.contributionMinor, c._count.members);

    // The next cycle to be drawn — the same definition the draw itself uses, so
    // the portal can't tell a member they owe a different cycle than the one
    // being collected.
    const nextCycle = Math.min(c._count.draws + 1, c.totalSeats);

    return {
      seatId: seat.id,
      position: seat.position,
      committeeId: c.id,
      committeeName: c.name,
      status: c.status,

      contributionDisplay: fmt(c.contributionMinor),
      potDisplay: fmt(potMinor),

      paidDisplay: fmt(ledger.totalPaid),
      outstandingDisplay: fmt(ledger.totalOutstanding),
      hasArrears: ledger.totalOutstanding > 0n,
      cyclesPaid: ledger.cyclesPaid,
      remainingInstallments: ledger.remainingInstallments,
      totalCycles: c.totalSeats,

      hasReceived: Boolean(win),
      receivedInCycle: win?.cycleNumber ?? null,
      receivedDisplay: win ? fmt(win.payoutMinor) : null,
      receivedAt: win?.drawnAt?.toISOString() ?? null,

      nextCycleNumber: nextCycle,
      nextDueDate: cycleDueDate(c, nextCycle).toISOString(),

      cycles: ledger.cycles.map((cy) => ({
        cycleNumber: cy.cycleNumber,
        status: cy.status,
        paidDisplay: fmt(cy.paid),
        expectedDisplay: fmt(cy.expected),
        dueDate: cy.dueDate.toISOString(),
      })),

      payments: seatPayments.map((p) => ({
        id: p.id,
        cycleNumber: p.cycleNumber,
        amountDisplay: fmt(p.amountMinor),
        lateFeeDisplay: fmt(p.lateFeeMinor ?? 0n),
        hasLateFee: BigInt(p.lateFeeMinor ?? 0) > 0n,
        isReversal: p.kind === "REVERSAL",
        method: p.method,
        referenceNumber: p.referenceNumber,
        paidAt: p.paidAt.toISOString(),
        receiptNumber: p.receipt?.receiptNumber ?? null,
      })),
    };
  });

  return { member: toMemberSummary(member), committees };
}

function toMemberSummary(member) {
  return {
    id: member.id,
    fullName: member.fullName,
    phone: member.phone,
    email: member.email,
    joiningDate: member.joiningDate?.toISOString() ?? null,
  };
}

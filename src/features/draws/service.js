import "server-only";

import { ok, err } from "@/core/result";
import { ErrorCode } from "@/core/errors";
import { writeAudit, AuditAction } from "@/core/audit";
import { can } from "@/core/auth/rbac";
import { Permission } from "@/core/auth/permissions";
import {
  createSeedCommitment,
  drawContext,
  deriveIndex,
  verifyDraw,
  ALGORITHM_VERSION,
} from "@/core/draw/rng";
import { collectionStatusForCycle } from "@/core/ledger";
import { potForCycle, formatMoney } from "@/core/money";
import { toDrawDto } from "./dto";

/**
 * The draw.
 *
 * Four things have to hold, and each is enforced in a different place on purpose:
 *
 *  1. Only an eligible member can win  — the candidate pool excludes past winners,
 *     AND the database enforces UNIQUE(winnerCommitteeMemberId) regardless.
 *  2. A cycle is drawn once            — UNIQUE(committeeId, cycleNumber), plus a
 *     row lock so two simultaneous clicks serialise instead of racing.
 *  3. The pot must be collected first  — checked here; overridable only by someone
 *     holding DRAW_OVERRIDE, and only with a reason, and always audited.
 *  4. The result must be verifiable    — commit/reveal, with the seed, commitment
 *     and frozen candidate list all stored.
 *
 * Belt and braces is deliberate. Rules 1 and 2 are guaranteed by Postgres even if
 * every line of this file is wrong.
 */

/** Load everything the draw needs, with the committee row locked. */
async function loadDrawState(tx, committeeId) {
  // SELECT ... FOR UPDATE. Two admins clicking "Draw" at the same moment will
  // serialise here; the second sees the first's draw and is refused by the unique
  // constraint rather than racing it.
  await tx.$queryRaw`SELECT id FROM "Committee" WHERE id = ${committeeId} FOR UPDATE`;

  const committee = await tx.committee.findUnique({
    where: { id: committeeId },
    select: {
      id: true,
      name: true,
      status: true,
      deletedAt: true,
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

  if (!committee || committee.deletedAt) return { committee: null };

  const [seats, draws, payments] = await Promise.all([
    tx.committeeMember.findMany({
      where: { committeeId, deletedAt: null, status: "ACTIVE" },
      select: {
        id: true,
        position: true,
        member: { select: { id: true, fullName: true, photoUrl: true } },
      },
      // Deterministic order: the candidate list is part of the verification
      // context, so it must be reproducible exactly.
      orderBy: { position: "asc" },
    }),
    tx.draw.findMany({
      where: { committeeId },
      select: { cycleNumber: true, winnerCommitteeMemberId: true },
    }),
    tx.payment.findMany({
      where: { committeeId },
      select: { committeeMemberId: true, cycleNumber: true, amountMinor: true },
    }),
  ]);

  return { committee, seats, draws, payments };
}

/**
 * What would happen if we drew right now — without drawing.
 * Powers the pre-draw screen: who's eligible, what's collected, what's blocking.
 */
export async function previewDraw(db, committeeId, now = new Date()) {
  const state = await db.$transaction(async (tx) => loadDrawState(tx, committeeId));
  const { committee, seats, draws, payments } = state;

  if (!committee) return err(ErrorCode.NOT_FOUND, "That committee no longer exists.");

  const analysis = analyse(committee, seats, draws, payments, now);
  if (!analysis.ok) return analysis;

  return ok(analysis.data);
}

/** Shared reasoning for preview and run — so the preview can never disagree with reality. */
function analyse(committee, seats, draws, payments, now) {
  if (committee.status === "COMPLETED") {
    return err(ErrorCode.CONFLICT, `“${committee.name}” has already finished.`);
  }
  if (committee.status !== "ACTIVE") {
    return err(
      ErrorCode.CONFLICT,
      `“${committee.name}” is ${committee.status.toLowerCase()}. Only an active committee can draw.`
    );
  }
  if (seats.length === 0) {
    return err(ErrorCode.DRAW_NO_ELIGIBLE_MEMBERS, "No members are assigned yet.");
  }
  if (seats.length !== committee.totalSeats) {
    return err(
      ErrorCode.CONFLICT,
      `The roster isn't full: ${seats.length} of ${committee.totalSeats} seats are taken. Everyone must be in before the first draw, or the pot and the schedule won't add up.`
    );
  }

  const wonIds = new Set(draws.map((d) => d.winnerCommitteeMemberId));
  const cycleNumber = draws.length + 1;

  if (cycleNumber > committee.totalSeats) {
    return err(ErrorCode.CONFLICT, "Every cycle has already been drawn.");
  }

  // Past winners are excluded from the pool. The database also refuses a repeat
  // winner outright, so this is the friendly layer over a hard guarantee.
  const candidates = seats.filter((s) => !wonIds.has(s.id));
  if (candidates.length === 0) {
    return err(ErrorCode.DRAW_NO_ELIGIBLE_MEMBERS, "Everyone has already received the pot.");
  }

  const paymentsByMember = new Map();
  for (const p of payments) {
    const list = paymentsByMember.get(p.committeeMemberId) ?? [];
    list.push(p);
    paymentsByMember.set(p.committeeMemberId, list);
  }

  const collection = collectionStatusForCycle(
    committee,
    cycleNumber,
    seats,
    paymentsByMember,
    now
  );

  const payoutMinor = potForCycle(committee.contributionMinor, committee.totalSeats);

  return ok({
    committee,
    seats,
    candidates,
    cycleNumber,
    collection,
    payoutMinor,
    payoutDisplay: formatMoney(payoutMinor, committee.currency, committee.currencyExponent),
  });
}

/**
 * Run the draw.
 *
 * @param {object} input
 * @param {string} input.committeeId
 * @param {boolean} [input.override]        draw despite incomplete collection
 * @param {string}  [input.overrideReason]  mandatory when override is true
 * @param {"MANUAL"|"AUTOMATIC"|"SCHEDULED"} [input.mode]
 */
export async function runDraw(db, actor, input, now = new Date()) {
  try {
    const draw = await db.$transaction(async (tx) => {
      const { committee, seats, draws, payments } = await loadDrawState(
        tx,
        input.committeeId
      );

      if (!committee) throw new DrawError(ErrorCode.NOT_FOUND, "That committee no longer exists.");

      const analysis = analyse(committee, seats, draws, payments, now);
      if (!analysis.ok) throw new DrawError(analysis.error.code, analysis.error.message);

      const { candidates, cycleNumber, collection, payoutMinor } = analysis.data;

      // --- The gate ------------------------------------------------------
      if (!collection.complete) {
        if (!input.override) {
          const names = collection.shortfalls.map((s) => s.memberName).join(", ");
          throw new DrawError(
            ErrorCode.DRAW_INCOMPLETE_PAYMENTS,
            `Cycle ${cycleNumber} isn't fully collected yet. Still owing: ${names}. Nobody should take the pot while others are still paying into it.`
          );
        }

        // Override is a privilege, not a checkbox. Re-checked here rather than
        // trusting the caller, because this action's own permission is DRAW_RUN.
        if (!can(actor, Permission.DRAW_OVERRIDE)) {
          throw new DrawError(
            ErrorCode.FORBIDDEN,
            "Only an organization owner can draw before the cycle is fully collected."
          );
        }
        if (!input.overrideReason || input.overrideReason.trim().length < 5) {
          throw new DrawError(
            ErrorCode.DRAW_OVERRIDE_REASON_REQUIRED,
            "Overriding the collection rule requires a reason."
          );
        }
      }

      // --- The draw ------------------------------------------------------
      const candidateIds = candidates.map((c) => c.id);
      const { serverSeed, commitment } = createSeedCommitment();
      const context = drawContext({ committeeId: committee.id, cycleNumber, candidateIds });
      const winnerIndex = deriveIndex(serverSeed, context, candidateIds.length);
      const winner = candidates[winnerIndex];

      const created = await tx.draw.create({
        data: {
          committeeId: committee.id,
          cycleNumber,
          winnerCommitteeMemberId: winner.id,
          seedCommitment: commitment,
          // Revealed immediately: the draw is over, so hiding the seed would only
          // prevent members verifying it. The commitment is what had to come first.
          serverSeed,
          eligibleSnapshot: candidateIds,
          winnerIndex,
          algorithmVersion: ALGORITHM_VERSION,
          payoutMinor,
          mode: input.mode ?? "MANUAL",
          isOverride: Boolean(input.override && !collection.complete),
          overrideReason: !collection.complete ? input.overrideReason?.trim() : null,
          conductedByUserId: actor.userId,
        },
        select: {
          id: true,
          cycleNumber: true,
          drawnAt: true,
          seedCommitment: true,
          serverSeed: true,
          eligibleSnapshot: true,
          winnerIndex: true,
          algorithmVersion: true,
          payoutMinor: true,
          mode: true,
          isOverride: true,
          overrideReason: true,
          committee: { select: { id: true, name: true, currency: true, currencyExponent: true } },
          winner: {
            select: {
              id: true,
              position: true,
              member: { select: { id: true, fullName: true, photoUrl: true } },
            },
          },
          conductedBy: { select: { name: true, email: true } },
        },
      });

      // The pot leaves the committee.
      await tx.transaction.create({
        data: {
          committeeId: committee.id,
          type: "PAYOUT_OUT",
          amountMinor: -payoutMinor,
          drawId: created.id,
          occurredAt: created.drawnAt,
          description: `Cycle ${cycleNumber} payout — ${winner.member.fullName}`,
        },
      });

      await writeAudit(tx, {
        action: created.isOverride ? AuditAction.DRAW_OVERRIDE : AuditAction.DRAW_RUN,
        actorUserId: actor.userId,
        entityType: "Draw",
        entityId: created.id,
        after: {
          cycleNumber,
          winnerId: winner.id,
          winnerName: winner.member.fullName,
          winnerIndex,
          candidateCount: candidateIds.length,
          seedCommitment: commitment,
          isOverride: created.isOverride,
          overrideReason: created.overrideReason,
          shortfalls: collection.shortfalls.map((s) => s.memberName),
        },
      });

      // Last cycle? The committee is done.
      if (cycleNumber === committee.totalSeats) {
        await tx.committee.update({
          where: { id: committee.id },
          data: { status: "COMPLETED" },
        });
      }

      return created;
    });

    return ok(toDrawDto(draw));
  } catch (error) {
    if (error instanceof DrawError) return err(error.code, error.message);

    // The unique constraints firing means someone beat us to it. That's the
    // race protection working, not a bug — report it as a conflict.
    if (error?.code === "P2002") {
      return err(
        ErrorCode.DRAW_ALREADY_RUN,
        "That cycle has just been drawn by someone else. Refresh to see the result."
      );
    }
    throw error;
  }
}

class DrawError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Independently re-verify a stored draw.
 * This is what a suspicious member (or an auditor) runs.
 */
export async function verifyStoredDraw(db, drawId) {
  const draw = await db.draw.findUnique({
    where: { id: drawId },
    select: {
      id: true,
      cycleNumber: true,
      committeeId: true,
      seedCommitment: true,
      serverSeed: true,
      eligibleSnapshot: true,
      winnerIndex: true,
      algorithmVersion: true,
      winner: { select: { id: true, member: { select: { fullName: true } } } },
    },
  });

  if (!draw) return err(ErrorCode.NOT_FOUND, "That draw no longer exists.");

  const result = verifyDraw({
    serverSeed: draw.serverSeed,
    commitment: draw.seedCommitment,
    committeeId: draw.committeeId,
    cycleNumber: draw.cycleNumber,
    candidateIds: draw.eligibleSnapshot,
    winnerIndex: draw.winnerIndex,
  });

  return ok({
    ...result,
    drawId: draw.id,
    algorithmVersion: draw.algorithmVersion,
    recordedWinner: draw.winner.member.fullName,
    // The winner the maths says it should be must match the one on record.
    winnerMatches: result.valid && result.winnerId === draw.winner.id,
    commitment: draw.seedCommitment,
    serverSeed: draw.serverSeed,
    candidateIds: draw.eligibleSnapshot,
  });
}

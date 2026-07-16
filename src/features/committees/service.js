import "server-only";

import * as repo from "./repository";
import { toCommitteeDto } from "./dto";
import { ok, err } from "@/core/result";
import { ErrorCode } from "@/core/errors";
import { writeAudit, AuditAction } from "@/core/audit";

export async function listCommittees(db, params) {
  const { rows, total } = await repo.listCommittees(db, params);
  return { rows: rows.map((c) => toCommitteeDto(c)), total };
}

export async function getCommittee(db, id) {
  const committee = await repo.findCommitteeById(db, id);
  if (!committee) return err(ErrorCode.NOT_FOUND, "That committee no longer exists.");
  return ok(toCommitteeDto(committee));
}

export async function createCommittee(db, actor, input) {
  const clash = await repo.findCommitteeByName(db, input.name);
  if (clash) {
    return err(ErrorCode.CONFLICT, "A committee with that name already exists.", {
      fields: { name: ["Already used by another committee"] },
    });
  }

  const committee = await db.$transaction(async (tx) => {
    const created = await repo.createCommittee(tx, input);

    await writeAudit(tx, {
      action: AuditAction.COMMITTEE_CREATE,
      actorUserId: actor.userId,
      entityType: "Committee",
      entityId: created.id,
      // redact() stringifies BigInt for us — Json columns can't hold one.
      after: created,
    });

    return created;
  });

  return ok(toCommitteeDto(committee));
}

export async function updateCommittee(db, actor, id, input) {
  const before = await repo.findCommitteeById(db, id);
  if (!before) return err(ErrorCode.NOT_FOUND, "That committee no longer exists.");

  if (input.name !== before.name) {
    const clash = await repo.findCommitteeByName(db, input.name);
    if (clash && clash.id !== id) {
      return err(ErrorCode.CONFLICT, "A committee with that name already exists.", {
        fields: { name: ["Already used by another committee"] },
      });
    }
  }

  // Two independent locks, on purpose — they used to be one combined check, which
  // was stricter than it needed to be and is exactly what made the roster feel
  // "fixed": adding a member after the first payment came in was refused even
  // though no draw had happened yet.
  //
  //  - contribution: locked once ANY payment exists. Payments already recorded
  //    assumed a specific amount; changing it now would silently misstate what
  //    people already paid.
  //  - totalSeats: locked once ANY draw exists, and NOT before. Seat count is
  //    managed by assignSeats/removeSeat, which keep it in sync with the actual
  //    roster right up until the first draw freezes it. See seats/service.js.
  const [drawsRun, paymentsMade, currentSeats] = await Promise.all([
    repo.countDraws(db, id),
    repo.countPayments(db, id),
    repo.countSeats(db, id),
  ]);

  if (paymentsMade > 0 && BigInt(input.contributionMinor) !== BigInt(before.contributionMinor)) {
    return err(
      ErrorCode.CONFLICT,
      "This committee already has payments recorded, so the monthly amount can no longer change.",
      { fields: { contribution: ["Locked once a payment has been recorded"] } }
    );
  }

  // totalSeats is derived, not user-editable, once any seat exists: assignSeats
  // and removeSeat are the only things allowed to change it pre-draw, so this
  // form field is ignored in favour of the real count rather than trusted blindly
  // (a stale form could otherwise silently reintroduce drift).
  const effectiveTotalSeats =
    drawsRun > 0 || currentSeats > 0 ? before.totalSeats : input.totalSeats;

  if (drawsRun > 0 && input.totalSeats !== before.totalSeats) {
    return err(
      ErrorCode.CONFLICT,
      "Draws have already started, so the roster is frozen. The pot and cycle count were fixed when the first draw ran.",
      { fields: { totalSeats: ["Locked once the first draw has run"] } }
    );
  }

  const committee = await db.$transaction(async (tx) => {
    const updated = await repo.updateCommittee(tx, id, {
      ...input,
      totalSeats: effectiveTotalSeats,
    });

    await writeAudit(tx, {
      action: AuditAction.COMMITTEE_UPDATE,
      actorUserId: actor.userId,
      entityType: "Committee",
      entityId: id,
      before,
      after: updated,
    });

    return updated;
  });

  return ok(toCommitteeDto(committee));
}

/**
 * Change just the status — e.g. Draft -> Active so the committee can draw.
 *
 * Deliberately separate from updateCommittee: that function requires the whole
 * form payload (it needs contributionMinor and totalSeats to check the money
 * locks), so reusing it for a one-field change would mean either fabricating the
 * rest of the payload or crashing on the missing fields. A quick status toggle
 * shouldn't need the full edit form open.
 */
export async function setCommitteeStatus(db, actor, id, status) {
  const before = await repo.findCommitteeById(db, id);
  if (!before) return err(ErrorCode.NOT_FOUND, "That committee no longer exists.");

  if (before.status === status) return ok(toCommitteeDto(before));

  const committee = await db.$transaction(async (tx) => {
    const updated = await repo.updateCommittee(tx, id, { status });

    await writeAudit(tx, {
      action: AuditAction.COMMITTEE_UPDATE,
      actorUserId: actor.userId,
      entityType: "Committee",
      entityId: id,
      before: { status: before.status },
      after: { status: updated.status },
    });

    return updated;
  });

  return ok(toCommitteeDto(committee));
}

export async function deleteCommittee(db, actor, id) {
  const before = await repo.findCommitteeById(db, id);
  if (!before) return err(ErrorCode.NOT_FOUND, "That committee no longer exists.");

  const drawsRun = await repo.countDraws(db, id);
  if (drawsRun > 0) {
    return err(
      ErrorCode.CONFLICT,
      `This committee has ${drawsRun} draw${drawsRun === 1 ? "" : "s"} on record. Cancel it instead — deleting it would erase who won what.`
    );
  }

  await db.$transaction(async (tx) => {
    const deleted = await repo.softDeleteCommittee(tx, id);

    await writeAudit(tx, {
      action: AuditAction.COMMITTEE_DELETE,
      actorUserId: actor.userId,
      entityType: "Committee",
      entityId: id,
      before,
      after: deleted,
    });
  });

  return ok({ id });
}

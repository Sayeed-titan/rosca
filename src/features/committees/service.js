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

  // Once money has moved, the terms are settled. Changing the contribution or the
  // roster size afterwards would silently rewrite what everyone already agreed to
  // and invalidate every payment recorded against the old figure.
  const drawsRun = await repo.countDraws(db, id);
  const paymentsMade = await repo.countPayments(db, id);
  const locked = drawsRun > 0 || paymentsMade > 0;

  if (locked) {
    if (BigInt(input.contributionMinor) !== BigInt(before.contributionMinor)) {
      return err(
        ErrorCode.CONFLICT,
        "This committee already has payments or draws recorded, so the monthly amount can no longer change.",
        { fields: { contribution: ["Locked once money has moved"] } }
      );
    }
    if (input.totalSeats !== before.totalSeats) {
      return err(
        ErrorCode.CONFLICT,
        "This committee already has payments or draws recorded, so the member count can no longer change.",
        { fields: { totalSeats: ["Locked once money has moved"] } }
      );
    }
  }

  const committee = await db.$transaction(async (tx) => {
    const updated = await repo.updateCommittee(tx, id, input);

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

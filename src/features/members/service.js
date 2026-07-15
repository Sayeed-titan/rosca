import "server-only";

import * as repo from "./repository";
import { toMemberDto } from "./dto";
import { ok, err } from "@/core/result";
import { ErrorCode } from "@/core/errors";
import { writeAudit, AuditAction } from "@/core/audit";

/**
 * Member business rules.
 *
 * Services own transactions and audit. Repositories own queries. Actions own
 * authorization. Keeping those separate is what makes each of them testable.
 */

export async function listMembers(db, params) {
  const { rows, total } = await repo.listMembers(db, params);
  return {
    rows: rows.map(toMemberDto),
    total,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function getMember(db, id) {
  const member = await repo.findMemberById(db, id);
  if (!member) return err(ErrorCode.NOT_FOUND, "That member no longer exists.");
  return ok(toMemberDto(member));
}

export async function createMember(db, actor, input) {
  // Friendly duplicate check before hitting the unique index. The index is still
  // the real guarantee — this exists so the user gets a useful message naming who
  // they collided with, rather than a raw constraint error.
  if (input.nationalId) {
    const existing = await repo.findMemberByNationalId(db, input.nationalId);
    if (existing) {
      return err(
        ErrorCode.CONFLICT,
        `${existing.fullName} already uses that National ID.`,
        { fields: { nationalId: ["Already registered to another member"] } }
      );
    }
  }

  const member = await db.$transaction(async (tx) => {
    const created = await repo.createMember(tx, input);

    // Same transaction as the insert: if this fails, the member insert rolls back.
    await writeAudit(tx, {
      action: AuditAction.MEMBER_CREATE,
      actorUserId: actor.userId,
      entityType: "Member",
      entityId: created.id,
      after: created,
    });

    return created;
  });

  return ok(toMemberDto(member));
}

export async function updateMember(db, actor, id, input) {
  const before = await repo.findMemberById(db, id);
  if (!before) return err(ErrorCode.NOT_FOUND, "That member no longer exists.");

  if (input.nationalId && input.nationalId !== before.nationalId) {
    const existing = await repo.findMemberByNationalId(db, input.nationalId);
    if (existing && existing.id !== id) {
      return err(
        ErrorCode.CONFLICT,
        `${existing.fullName} already uses that National ID.`,
        { fields: { nationalId: ["Already registered to another member"] } }
      );
    }
  }

  const member = await db.$transaction(async (tx) => {
    const updated = await repo.updateMember(tx, id, input);

    await writeAudit(tx, {
      action: AuditAction.MEMBER_UPDATE,
      actorUserId: actor.userId,
      entityType: "Member",
      entityId: id,
      before,
      after: updated,
    });

    return updated;
  });

  return ok(toMemberDto(member));
}

export async function deleteMember(db, actor, id) {
  const before = await repo.findMemberById(db, id);
  if (!before) return err(ErrorCode.NOT_FOUND, "That member no longer exists.");

  // Refuse to remove someone who is mid-committee. They owe contributions and are
  // still in the draw pool — removing them would corrupt both the collection
  // schedule and the fairness of every remaining draw.
  const activeSeats = await repo.countActiveSeats(db, id);
  if (activeSeats > 0) {
    return err(
      ErrorCode.CONFLICT,
      `${before.fullName} is still active in ${activeSeats} committee${
        activeSeats === 1 ? "" : "s"
      }. Remove them from those first.`
    );
  }

  await db.$transaction(async (tx) => {
    const deleted = await repo.softDeleteMember(tx, id);

    await writeAudit(tx, {
      action: AuditAction.MEMBER_DELETE,
      actorUserId: actor.userId,
      entityType: "Member",
      entityId: id,
      before,
      after: deleted,
    });
  });

  return ok({ id });
}

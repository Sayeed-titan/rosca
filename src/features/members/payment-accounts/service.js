import "server-only";

import { ok, err } from "@/core/result";
import { ErrorCode } from "@/core/errors";
import { writeAudit, AuditAction } from "@/core/audit";

/**
 * Saved payment accounts (MFS/bank numbers) for members.
 *
 * Pure convenience: a lookup that saves retyping a bKash number every cycle. Never
 * the source of truth for what was actually paid — Payment.referenceNumber is
 * copied at the moment of payment and stays frozen even if the saved account is
 * later edited or deleted.
 */

export async function listAccountsForOrg(db) {
  return db.memberPaymentAccount.findMany({
    select: {
      id: true,
      memberId: true,
      method: true,
      accountNumber: true,
      label: true,
      isDefault: true,
    },
    orderBy: [{ memberId: "asc" }, { isDefault: "desc" }, { createdAt: "asc" }],
  });
}

export async function listAccountsForMember(db, memberId) {
  return db.memberPaymentAccount.findMany({
    where: { memberId },
    select: {
      id: true,
      method: true,
      accountNumber: true,
      label: true,
      isDefault: true,
    },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
}

/**
 * Save a payment account. If marked default, un-defaults any other account of the
 * same method for that member — "default" means one per method, not one overall
 * (someone might default to bKash for small payments and bank transfer for large).
 */
export async function saveAccount(db, actor, input) {
  const member = await db.member.findUnique({
    where: { id: input.memberId },
    select: { id: true, fullName: true, deletedAt: true },
  });
  if (!member || member.deletedAt) {
    return err(ErrorCode.NOT_FOUND, "That member no longer exists.");
  }

  const account = await db.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.memberPaymentAccount.updateMany({
        where: { memberId: input.memberId, method: input.method, isDefault: true },
        data: { isDefault: false },
      });
    }

    const created = await tx.memberPaymentAccount.create({
      data: {
        memberId: input.memberId,
        method: input.method,
        accountNumber: input.accountNumber,
        label: input.label || null,
        isDefault: Boolean(input.isDefault),
      },
      select: {
        id: true,
        memberId: true,
        method: true,
        accountNumber: true,
        label: true,
        isDefault: true,
      },
    });

    await writeAudit(tx, {
      action: AuditAction.MEMBER_PAYMENT_ACCOUNT_SAVE,
      actorUserId: actor.userId,
      entityType: "MemberPaymentAccount",
      entityId: created.id,
      after: { memberName: member.fullName, ...created },
    });

    return created;
  });

  return ok(account);
}

export async function removeAccount(db, actor, { id }) {
  const account = await db.memberPaymentAccount.findUnique({
    where: { id },
    select: {
      id: true,
      method: true,
      accountNumber: true,
      member: { select: { fullName: true } },
    },
  });
  if (!account) return err(ErrorCode.NOT_FOUND, "That saved account no longer exists.");

  await db.$transaction(async (tx) => {
    await tx.memberPaymentAccount.delete({ where: { id } });

    await writeAudit(tx, {
      action: AuditAction.MEMBER_PAYMENT_ACCOUNT_REMOVE,
      actorUserId: actor.userId,
      entityType: "MemberPaymentAccount",
      entityId: id,
      before: account,
    });
  });

  return ok({ id });
}

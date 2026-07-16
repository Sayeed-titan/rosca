import "server-only";

import { writeAudit, AuditAction } from "@/core/audit";
import { ok, err } from "@/core/result";
import { ErrorCode } from "@/core/errors";

/**
 * Organization settings and team management.
 */

export async function getOrganizationSettings(db, organizationId) {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      currency: true,
      timezone: true,
      createdAt: true,
    },
  });
  if (!org) return null;

  return { ...org, createdAt: org.createdAt.toISOString() };
}

export async function updateOrganizationSettings(db, actor, input) {
  const before = await db.organization.findUnique({
    where: { id: actor.organizationId },
    select: { name: true, currency: true, timezone: true },
  });

  const updated = await db.$transaction(async (tx) => {
    const org = await tx.organization.update({
      where: { id: actor.organizationId },
      data: {
        name: input.name,
        currency: input.currency,
        timezone: input.timezone,
      },
      select: { id: true, name: true, currency: true, timezone: true },
    });

    await writeAudit(tx, {
      action: AuditAction.ORG_UPDATE,
      actorUserId: actor.userId,
      entityType: "Organization",
      entityId: org.id,
      before,
      after: org,
    });

    return org;
  });

  return ok(updated);
}

/** Everyone with a login in this organization, and what they can do. */
export async function listTeam(db) {
  const rows = await db.membership.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true, isSuperAdmin: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((m) => ({
    id: m.id,
    role: m.role,
    joinedAt: m.createdAt.toISOString(),
    userId: m.user.id,
    name: m.user.name ?? m.user.email,
    email: m.user.email,
    isSuperAdmin: m.user.isSuperAdmin,
  }));
}

/**
 * Change someone's role.
 *
 * Two guards, both protecting against changes that cannot be undone through the
 * UI afterwards:
 *
 *  - The last owner cannot be demoted. An organization with no owner can never
 *    change its own settings or roles again; recovering needs database surgery.
 *  - You cannot demote yourself. Doing so revokes the very permission you'd need
 *    to undo it — a one-way trapdoor triggered by a misclick.
 *
 * ORDER MATTERS. The last-owner check runs FIRST, because the common case is a
 * solo owner demoting themselves — and they are both the last owner AND
 * themselves. Checking self first made the last-owner guard unreachable in the
 * only situation it exists for, and told them to "ask another owner" when the
 * real problem is that there isn't one. A test caught exactly this.
 */
export async function changeMemberRole(db, actor, { membershipId, role }) {
  const membership = await db.membership.findUnique({
    where: { id: membershipId },
    select: {
      id: true,
      role: true,
      userId: true,
      user: { select: { name: true, email: true } },
    },
  });

  if (!membership) {
    return err(ErrorCode.NOT_FOUND, "That team member no longer exists.");
  }

  if (membership.role === role) return ok({ id: membershipId, role });

  // Cheap pre-check so the message names the real problem. The authoritative
  // check is inside the transaction below, where it can't race.
  if (membership.role === "ORG_OWNER" && role !== "ORG_OWNER") {
    const otherOwners = await db.membership.count({
      where: { role: "ORG_OWNER", deletedAt: null, id: { not: membershipId } },
    });
    if (otherOwners === 0) {
      return err(
        ErrorCode.CONFLICT,
        "This is the only owner. Promote someone else to owner first, or the organization would be left with nobody who can manage it."
      );
    }
  }

  if (membership.userId === actor.userId) {
    return err(
      ErrorCode.CONFLICT,
      "You can't change your own role — ask another owner to do it."
    );
  }

  const result = await db.$transaction(async (tx) => {
    // Re-checked inside the transaction: two owners demoting each other at the
    // same moment could both pass the pre-check above and leave zero owners.
    if (membership.role === "ORG_OWNER" && role !== "ORG_OWNER") {
      const otherOwners = await tx.membership.count({
        where: {
          role: "ORG_OWNER",
          deletedAt: null,
          id: { not: membershipId },
        },
      });

      if (otherOwners === 0) {
        return err(
          ErrorCode.CONFLICT,
          "This is the only owner. Promote someone else to owner first, or the organization would be left with nobody who can manage it."
        );
      }
    }

    const updated = await tx.membership.update({
      where: { id: membershipId },
      data: { role },
      select: { id: true, role: true },
    });

    await writeAudit(tx, {
      action: AuditAction.ORG_MEMBER_ROLE_CHANGE,
      actorUserId: actor.userId,
      entityType: "Membership",
      entityId: membershipId,
      before: { role: membership.role, user: membership.user.email },
      after: { role: updated.role, user: membership.user.email },
    });

    return ok(updated);
  });

  return result;
}

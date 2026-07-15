/**
 * Authorization checks.
 *
 * These are enforced in the SERVICE layer, never only in the UI. Hiding a button
 * is cosmetic — a Server Action is a public HTTP endpoint, and anyone can call it
 * directly whether or not we rendered the button.
 */
import { ROLE_PERMISSIONS } from "./permissions";
import { ForbiddenError, UnauthenticatedError } from "@/core/errors";

/**
 * @typedef {object} ActorContext
 * @property {string}  userId
 * @property {boolean} isSuperAdmin
 * @property {string=} organizationId  active org
 * @property {("ORG_OWNER"|"MANAGER"|"MEMBER")=} role  role in the active org
 */

/**
 * Does this actor hold `permission` in their active organization?
 */
export function can(actor, permission) {
  if (!actor?.userId) return false;

  // Platform operators bypass org roles by design. This is the one intentional
  // hole in the tenancy model, which is exactly why it is a single explicit
  // branch here rather than a role sprinkled through ROLE_PERMISSIONS.
  if (actor.isSuperAdmin) return true;

  if (!actor.role) return false;

  const granted = ROLE_PERMISSIONS[actor.role];
  return Array.isArray(granted) && granted.includes(permission);
}

/** Throws unless the actor holds the permission. */
export function assertCan(actor, permission) {
  if (!actor?.userId) throw new UnauthenticatedError();
  if (!can(actor, permission)) throw new ForbiddenError(permission);
}

/**
 * A MEMBER may only read their own records; staff may read anyone's.
 * Ownership checks are separate from permission checks — holding PAYMENT_VIEW
 * says you may view payments, not *whose*.
 */
export function canAccessMember(actor, memberRecord) {
  if (!actor?.userId) return false;
  if (actor.isSuperAdmin) return true;
  if (actor.role === "ORG_OWNER" || actor.role === "MANAGER") return true;
  return memberRecord?.userId === actor.userId;
}

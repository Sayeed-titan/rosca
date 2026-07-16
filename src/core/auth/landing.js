import { can } from "./rbac";
import { Permission } from "./permissions";

/**
 * Where a signed-in actor should land.
 *
 * A MEMBER has no ORG_VIEW, so sending everyone to /dashboard means members hit
 * a "you don't have access" wall the instant they sign in — technically correct
 * and completely useless. Their home is their own committees.
 *
 * One function, used by the root redirect and by login, so the two can't
 * disagree about where someone belongs.
 */
export function landingPathFor(actor) {
  if (!actor?.organizationId) return "/no-organization";
  return can(actor, Permission.ORG_VIEW) ? "/dashboard" : "/portal";
}

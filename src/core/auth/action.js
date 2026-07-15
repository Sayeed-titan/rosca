/**
 * The Server Action boundary.
 *
 * A Server Action is a public HTTP endpoint. It does not matter that we only
 * rendered the button for admins — anyone can POST to it. So every action is
 * wrapped here, and the wrapper is the only thing standing between the internet
 * and the service layer. It:
 *
 *   1. resolves and requires an authenticated actor,
 *   2. asserts the permission,
 *   3. hands the handler an org-scoped db client (never the raw one),
 *   4. converts thrown errors into Results so the UI gets a usable message
 *      instead of React's opaque production error digest.
 *
 * Usage:
 *   export const createCommittee = withPermission(
 *     Permission.COMMITTEE_CREATE,
 *     async ({ actor, db }, input) => { ... return ok(dto); }
 *   );
 */
import { requireOrgActor } from "./session";
import { assertCan } from "./rbac";
import { forOrganization } from "@/core/db/tenant";
import { err } from "@/core/result";
import { ErrorCode, ForbiddenError, UnauthenticatedError } from "@/core/errors";

/** Maps a thrown error onto a Result the UI can render. */
export function toErrorResult(error) {
  if (error instanceof UnauthenticatedError) {
    return err(ErrorCode.UNAUTHENTICATED, "Please sign in and try again.");
  }
  if (error instanceof ForbiddenError) {
    return err(
      error.code ?? ErrorCode.FORBIDDEN,
      error.message ?? "You do not have permission to do that."
    );
  }

  // Prisma's known error codes, translated to something a human can act on.
  if (error?.code === "P2002") {
    return err(ErrorCode.CONFLICT, "That already exists.", {
      target: error.meta?.target,
    });
  }
  if (error?.code === "P2025") {
    return err(ErrorCode.NOT_FOUND, "That record no longer exists.");
  }

  // Anything unrecognised is a bug. Log it server-side; show the user something
  // honest but non-leaky.
  console.error("[action] unhandled error:", error);
  return err(ErrorCode.INTERNAL, "Something went wrong. Please try again.");
}

/**
 * @param {string} permission one of Permission.*
 * @param {(ctx: {actor: object, db: object}, ...args: any[]) => Promise<object>} handler
 */
export function withPermission(permission, handler) {
  return async function boundAction(...args) {
    try {
      const actor = await requireOrgActor();
      assertCan(actor, permission);
      const db = forOrganization(actor.organizationId);
      return await handler({ actor, db }, ...args);
    } catch (error) {
      return toErrorResult(error);
    }
  };
}

/**
 * For actions that need a signed-in user but no organization scope
 * (e.g. switching orgs, accepting an invite).
 */
export function withAuth(handler) {
  return async function boundAction(...args) {
    try {
      const { requireActor } = await import("./session");
      const actor = await requireActor();
      return await handler({ actor }, ...args);
    } catch (error) {
      return toErrorResult(error);
    }
  };
}

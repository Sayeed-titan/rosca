/**
 * Resolves the current actor: who they are, which organization they're acting in,
 * and what role they hold there.
 *
 * The role is read from the database on every request rather than from the JWT —
 * see the note in ./index.js. Wrapped in React's `cache()` so it's a single query
 * per request no matter how many components ask.
 */
import { cache } from "react";
import { cookies } from "next/headers";

import { auth } from "./index";
import { prisma } from "@/core/db/prisma";
import { UnauthenticatedError, ForbiddenError, ErrorCode } from "@/core/errors";

/** Cookie holding the org the user is currently looking at. */
export const ACTIVE_ORG_COOKIE = "cf_active_org";

/**
 * @returns {Promise<import("./rbac").ActorContext & {memberships: Array}|null>}
 */
export const getActor = cache(async () => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const isSuperAdmin = Boolean(session.user.isSuperAdmin);

  const memberships = await prisma.membership.findMany({
    where: { userId, deletedAt: null },
    include: { organization: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "asc" },
  });

  // `cookies()` is async in Next 16 — the synchronous form was removed, not just
  // deprecated, so every guide showing `cookies().get(...)` is now wrong.
  const jar = await cookies();
  const requestedOrgId = jar.get(ACTIVE_ORG_COOKIE)?.value;

  let organizationId;
  let role;

  const requested = memberships.find((m) => m.organizationId === requestedOrgId);

  if (requested) {
    organizationId = requested.organizationId;
    role = requested.role;
  } else if (isSuperAdmin && requestedOrgId) {
    // Platform operators may act in any org, including ones they aren't a member
    // of. Verify it exists so a forged cookie can't scope us to a bogus id.
    const org = await prisma.organization.findFirst({
      where: { id: requestedOrgId, deletedAt: null },
      select: { id: true },
    });
    organizationId = org?.id;
    role = org ? "ORG_OWNER" : undefined;
  } else if (memberships.length > 0) {
    organizationId = memberships[0].organizationId;
    role = memberships[0].role;
  }

  return {
    userId,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
    isSuperAdmin,
    organizationId,
    role,
    memberships: memberships.map((m) => ({
      organizationId: m.organizationId,
      role: m.role,
      organization: m.organization,
    })),
  };
});

/** Throws unless signed in. */
export async function requireActor() {
  const actor = await getActor();
  if (!actor) throw new UnauthenticatedError();
  return actor;
}

/** Throws unless signed in AND scoped to an organization. */
export async function requireOrgActor() {
  const actor = await requireActor();
  if (!actor.organizationId) {
    const e = new ForbiddenError("org.view");
    e.code = ErrorCode.NO_ORGANIZATION;
    e.message = "You do not belong to any organization yet.";
    throw e;
  }
  return actor;
}

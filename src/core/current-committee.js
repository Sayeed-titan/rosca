import "server-only";

import { cookies } from "next/headers";

/** Which committee the sidebar switcher currently has selected, org-wide. */
export const CURRENT_COMMITTEE_COOKIE = "cf_committee";

export async function getCurrentCommitteeIdFromCookie() {
  const store = await cookies();
  return store.get(CURRENT_COMMITTEE_COOKIE)?.value ?? null;
}

/**
 * Resolve the committee that should actually be shown, given the raw cookie
 * value and the org's real committee list.
 *
 * The cookie is client-writable and can go stale (a committee got deleted, or it
 * belongs to a different org entirely after switching accounts), so it's never
 * trusted blindly — it's checked against `committees` and falls back to the most
 * relevant one otherwise. This is what every page calls, so the fallback logic
 * lives in exactly one place.
 */
export function resolveCurrentCommittee(cookieId, committees) {
  if (committees.length === 0) return null;

  const fromCookie = cookieId && committees.find((c) => c.id === cookieId);
  if (fromCookie) return fromCookie;

  return committees.find((c) => c.status === "ACTIVE") ?? committees[0];
}

/**
 * What every page under (app) calls to find "the" committee.
 *
 * The layout already resolves this for the sidebar switcher, but a Server
 * Component page can't receive extra props from its layout (only `children`
 * flows down), so each page re-derives the same answer from the same cookie —
 * kept to one function so the fallback rule never drifts between the sidebar
 * and the pages it's supposed to control.
 */
export async function getResolvedCurrentCommittee(db) {
  const committees = await db.committee.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, status: true },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  const cookieId = await getCurrentCommitteeIdFromCookie();
  return { committees, current: resolveCurrentCommittee(cookieId, committees) };
}

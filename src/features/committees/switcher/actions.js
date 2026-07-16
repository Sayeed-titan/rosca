"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { requireOrgActor } from "@/core/auth/session";
import { forOrganization } from "@/core/db/tenant";
import { CURRENT_COMMITTEE_COOKIE } from "@/core/current-committee";
import { ok, err } from "@/core/result";
import { ErrorCode } from "@/core/errors";

/**
 * Set the org-wide "current committee" the sidebar switcher points at.
 *
 * A cookie is client-writable, so the id is re-checked against the actor's own
 * org before being trusted — a forged id just gets refused rather than leaking
 * whether some other org's committee id exists.
 */
export async function setCurrentCommitteeAction(committeeId) {
  const actor = await requireOrgActor();
  const store = await cookies();

  if (!committeeId) {
    store.delete(CURRENT_COMMITTEE_COOKIE);
    revalidatePath("/", "layout");
    return ok({ committeeId: null });
  }

  const db = forOrganization(actor.organizationId);
  const exists = await db.committee.findUnique({
    where: { id: committeeId },
    select: { id: true },
  });
  if (!exists) {
    return err(ErrorCode.NOT_FOUND, "That committee no longer exists.");
  }

  store.set(CURRENT_COMMITTEE_COOKIE, committeeId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
  return ok({ committeeId });
}

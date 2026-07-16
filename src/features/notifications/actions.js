"use server";

import { revalidatePath } from "next/cache";

import { requireOrgActor } from "@/core/auth/session";
import { forOrganization } from "@/core/db/tenant";
import * as service from "./service";
import { ok } from "@/core/result";
import { toErrorResult } from "@/core/auth/action";

/**
 * Notification actions.
 *
 * Not wrapped in withPermission: every signed-in user reads their OWN
 * notifications, so there's no permission to check — the scoping is by userId,
 * which is taken from the session and never from the caller.
 */
export async function markNotificationReadAction(notificationId) {
  try {
    const actor = await requireOrgActor();
    const db = forOrganization(actor.organizationId);
    await service.markRead(db, actor.userId, notificationId);
    revalidatePath("/", "layout");
    return ok({ id: notificationId });
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function markAllNotificationsReadAction() {
  try {
    const actor = await requireOrgActor();
    const db = forOrganization(actor.organizationId);
    const result = await service.markAllRead(db, actor.userId);
    revalidatePath("/", "layout");
    return ok(result);
  } catch (error) {
    return toErrorResult(error);
  }
}

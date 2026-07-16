"use server";

import { revalidatePath } from "next/cache";

import { withPermission } from "@/core/auth/action";
import { Permission } from "@/core/auth/permissions";
import { organizationSettingsSchema, changeRoleSchema } from "./settings-schema";
import * as service from "./settings-service";
import { err } from "@/core/result";
import { ErrorCode } from "@/core/errors";

function invalid(parsed) {
  return err(ErrorCode.VALIDATION, "Please fix the highlighted fields.", {
    fields: parsed.error.flatten().fieldErrors,
  });
}

export const updateOrganizationSettingsAction = withPermission(
  Permission.ORG_UPDATE,
  async ({ actor, db }, input) => {
    const parsed = organizationSettingsSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed);

    const result = await service.updateOrganizationSettings(db, actor, parsed.data);
    if (result.ok) revalidatePath("/", "layout");
    return result;
  }
);

/**
 * Role changes are gated on ORG_MANAGE_MEMBERS, not ORG_UPDATE — being able to
 * rename the org shouldn't imply being able to hand out owner access.
 */
export const changeMemberRoleAction = withPermission(
  Permission.ORG_MANAGE_MEMBERS,
  async ({ actor, db }, input) => {
    const parsed = changeRoleSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed);

    const result = await service.changeMemberRole(db, actor, parsed.data);
    if (result.ok) revalidatePath("/settings");
    return result;
  }
);

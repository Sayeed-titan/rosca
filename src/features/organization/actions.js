"use server";

import { revalidatePath } from "next/cache";

import { withPermission } from "@/core/auth/action";
import { Permission } from "@/core/auth/permissions";
import { writeAudit, AuditAction } from "@/core/audit";
import { renameOrganizationSchema } from "./schema";
import { ok, err } from "@/core/result";
import { ErrorCode } from "@/core/errors";

/**
 * Rename the organization. ORG_OWNER only — this is the account's identity, not
 * a day-to-day operational setting.
 *
 * `db.organization.update` looks unscoped, but it isn't: the tenant extension
 * special-cases the Organization model and forces `where.id` to the actor's own
 * organizationId regardless of what's passed in (see core/db/tenant.js) — there
 * is no id a caller could supply that reaches a different org's row.
 */
export const renameOrganizationAction = withPermission(
  Permission.ORG_UPDATE,
  async ({ actor, db }, input) => {
    const parsed = renameOrganizationSchema.safeParse(input);
    if (!parsed.success) {
      return err(ErrorCode.VALIDATION, "Please fix the highlighted fields.", {
        fields: parsed.error.flatten().fieldErrors,
      });
    }

    const before = await db.organization.findUnique({
      where: { id: actor.organizationId },
      select: { name: true },
    });

    const updated = await db.$transaction(async (tx) => {
      const org = await tx.organization.update({
        where: { id: actor.organizationId },
        data: { name: parsed.data.name },
        select: { id: true, name: true },
      });

      await writeAudit(tx, {
        action: AuditAction.ORG_UPDATE,
        actorUserId: actor.userId,
        entityType: "Organization",
        entityId: org.id,
        before: { name: before?.name },
        after: { name: org.name },
      });

      return org;
    });

    revalidatePath("/", "layout");
    return ok(updated);
  }
);

"use server";

import { revalidatePath } from "next/cache";

import { withPermission } from "@/core/auth/action";
import { Permission } from "@/core/auth/permissions";
import { memberSchema, memberUpdateSchema, normalizeMemberInput } from "./schema";
import * as service from "./service";
import { err } from "@/core/result";
import { ErrorCode } from "@/core/errors";

/**
 * Member Server Actions.
 *
 * withPermission resolves the actor, asserts the permission and hands over an
 * org-scoped db. Nothing here can run unauthenticated or unscoped, and validation
 * happens again server-side — the browser's copy is only a courtesy.
 */

function invalid(parsed) {
  return err(ErrorCode.VALIDATION, "Please fix the highlighted fields.", {
    fields: parsed.error.flatten().fieldErrors,
  });
}

export const createMemberAction = withPermission(
  Permission.MEMBER_CREATE,
  async ({ actor, db }, input) => {
    const parsed = memberSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed);

    // Normalise once, server-side, after validation.
    const result = await service.createMember(
      db,
      actor,
      normalizeMemberInput(parsed.data)
    );
    if (result.ok) revalidatePath("/members");
    return result;
  }
);

export const updateMemberAction = withPermission(
  Permission.MEMBER_UPDATE,
  async ({ actor, db }, input) => {
    const parsed = memberUpdateSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed);

    const { id, ...values } = parsed.data;
    const result = await service.updateMember(
      db,
      actor,
      id,
      normalizeMemberInput(values)
    );
    if (result.ok) revalidatePath("/members");
    return result;
  }
);

export const deleteMemberAction = withPermission(
  Permission.MEMBER_DELETE,
  async ({ actor, db }, id) => {
    if (typeof id !== "string" || !id) {
      return err(ErrorCode.VALIDATION, "Missing member id.");
    }

    const result = await service.deleteMember(db, actor, id);
    if (result.ok) revalidatePath("/members");
    return result;
  }
);

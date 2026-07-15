"use server";

import { revalidatePath } from "next/cache";

import { withPermission } from "@/core/auth/action";
import { Permission } from "@/core/auth/permissions";
import {
  committeeSchema,
  committeeUpdateSchema,
  normalizeCommitteeInput,
} from "./schema";
import * as service from "./service";
import { err } from "@/core/result";
import { ErrorCode } from "@/core/errors";

function invalid(parsed) {
  return err(ErrorCode.VALIDATION, "Please fix the highlighted fields.", {
    fields: parsed.error.flatten().fieldErrors,
  });
}

export const createCommitteeAction = withPermission(
  Permission.COMMITTEE_CREATE,
  async ({ actor, db }, input) => {
    const parsed = committeeSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed);

    const result = await service.createCommittee(
      db,
      actor,
      normalizeCommitteeInput(parsed.data)
    );
    if (result.ok) revalidatePath("/committees");
    return result;
  }
);

export const updateCommitteeAction = withPermission(
  Permission.COMMITTEE_UPDATE,
  async ({ actor, db }, input) => {
    const parsed = committeeUpdateSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed);

    const { id, ...values } = parsed.data;
    const result = await service.updateCommittee(
      db,
      actor,
      id,
      normalizeCommitteeInput(values)
    );
    if (result.ok) revalidatePath("/committees");
    return result;
  }
);

export const deleteCommitteeAction = withPermission(
  Permission.COMMITTEE_DELETE,
  async ({ actor, db }, id) => {
    if (typeof id !== "string" || !id) {
      return err(ErrorCode.VALIDATION, "Missing committee id.");
    }
    const result = await service.deleteCommittee(db, actor, id);
    if (result.ok) revalidatePath("/committees");
    return result;
  }
);

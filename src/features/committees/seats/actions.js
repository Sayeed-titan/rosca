"use server";

import { revalidatePath } from "next/cache";

import { withPermission } from "@/core/auth/action";
import { Permission } from "@/core/auth/permissions";
import { assignSeatsSchema, removeSeatSchema } from "./schema";
import * as service from "./service";
import { err } from "@/core/result";
import { ErrorCode } from "@/core/errors";

function invalid(parsed) {
  return err(ErrorCode.VALIDATION, "Please fix the highlighted fields.", {
    fields: parsed.error.flatten().fieldErrors,
  });
}

export const assignSeatsAction = withPermission(
  Permission.COMMITTEE_ASSIGN_MEMBERS,
  async ({ actor, db }, input) => {
    const parsed = assignSeatsSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed);

    const result = await service.assignSeats(db, actor, parsed.data);
    if (result.ok) {
      revalidatePath(`/committees/${parsed.data.committeeId}`);
      revalidatePath("/committees");
    }
    return result;
  }
);

export const removeSeatAction = withPermission(
  Permission.COMMITTEE_ASSIGN_MEMBERS,
  async ({ actor, db }, input) => {
    const parsed = removeSeatSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed);

    const result = await service.removeSeat(db, actor, parsed.data);
    if (result.ok) {
      revalidatePath("/committees");
    }
    return result;
  }
);

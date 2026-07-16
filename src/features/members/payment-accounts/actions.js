"use server";

import { revalidatePath } from "next/cache";

import { withPermission } from "@/core/auth/action";
import { Permission } from "@/core/auth/permissions";
import { paymentAccountSchema, removePaymentAccountSchema } from "./schema";
import * as service from "./service";
import { err } from "@/core/result";
import { ErrorCode } from "@/core/errors";

function invalid(parsed) {
  return err(ErrorCode.VALIDATION, "Please fix the highlighted fields.", {
    fields: parsed.error.flatten().fieldErrors,
  });
}

/// Gated by MEMBER_UPDATE — a saved account is part of a member's profile, not a
/// financial record in its own right.
export const savePaymentAccountAction = withPermission(
  Permission.MEMBER_UPDATE,
  async ({ actor, db }, input) => {
    const parsed = paymentAccountSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed);

    const result = await service.saveAccount(db, actor, parsed.data);
    if (result.ok) {
      revalidatePath("/members");
      revalidatePath("/payments");
    }
    return result;
  }
);

export const removePaymentAccountAction = withPermission(
  Permission.MEMBER_UPDATE,
  async ({ actor, db }, input) => {
    const parsed = removePaymentAccountSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed);

    const result = await service.removeAccount(db, actor, parsed.data);
    if (result.ok) {
      revalidatePath("/members");
      revalidatePath("/payments");
    }
    return result;
  }
);

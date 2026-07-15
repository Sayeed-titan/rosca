"use server";

import { revalidatePath } from "next/cache";

import { withPermission } from "@/core/auth/action";
import { Permission } from "@/core/auth/permissions";
import { paymentSchema, reversalSchema, normalizePaymentInput } from "./schema";
import * as service from "./service";
import { err } from "@/core/result";
import { ErrorCode } from "@/core/errors";

function invalid(parsed) {
  return err(ErrorCode.VALIDATION, "Please fix the highlighted fields.", {
    fields: parsed.error.flatten().fieldErrors,
  });
}

export const recordPaymentAction = withPermission(
  Permission.PAYMENT_CREATE,
  async ({ actor, db }, input) => {
    const parsed = paymentSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed);

    const result = await service.recordPayment(
      db,
      actor,
      normalizePaymentInput(parsed.data)
    );

    if (result.ok) {
      revalidatePath("/payments");
      revalidatePath("/dashboard");
      revalidatePath("/committees");
    }
    return result;
  }
);

export const getReceiptAction = withPermission(
  Permission.PAYMENT_VIEW,
  async ({ db }, paymentId) => {
    if (typeof paymentId !== "string" || !paymentId) {
      return err(ErrorCode.VALIDATION, "Missing payment id.");
    }
    // Scoped db: a receipt id from another organization simply won't be found.
    return service.getReceipt(db, paymentId);
  }
);

/**
 * Reversal needs its own permission — a Manager can take money in but only an
 * Owner can unwind it. See the separation-of-duties tests.
 */
export const reversePaymentAction = withPermission(
  Permission.PAYMENT_REVERSE,
  async ({ actor, db }, input) => {
    const parsed = reversalSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed);

    const result = await service.reversePayment(db, actor, parsed.data);

    if (result.ok) {
      revalidatePath("/payments");
      revalidatePath("/dashboard");
    }
    return result;
  }
);

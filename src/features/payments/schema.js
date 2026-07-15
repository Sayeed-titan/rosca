import { z } from "zod";

import { toMinor } from "@/core/money";

export const PAYMENT_METHODS = [
  "CASH",
  "BANK_TRANSFER",
  "BKASH",
  "NAGAD",
  "ROCKET",
  "CARD",
  "OTHER",
];

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

/**
 * Payment validation.
 *
 * VALIDATES ONLY — no `.transform()`, for the same reason as members/committees:
 * the schema runs on both the client and the server, so it must parse its own
 * output. See tests/schema.test.js.
 */
export const paymentSchema = z.object({
  committeeId: z.string().min(1, { message: "Choose a committee" }),
  committeeMemberId: z.string().min(1, { message: "Choose a member" }),

  cycleNumber: z.coerce
    .number()
    .int()
    .min(1, { message: "Cycle must be 1 or higher" })
    .max(200),

  amount: z
    .string()
    .trim()
    .min(1, { message: "Amount is required" })
    .regex(AMOUNT_RE, { message: "Enter an amount like 5000 or 5000.50" }),

  paidAt: z
    .string()
    .min(1, { message: "Payment date is required" })
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid date" }),

  method: z.enum(PAYMENT_METHODS),
  referenceNumber: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500).optional(),

  /**
   * Optional manual override of the calculated late fee.
   * Blank means "use whatever the committee's rules produce" — the normal path.
   * An organiser waiving a fee must do it explicitly, and it's audited.
   */
  lateFeeOverride: z
    .union([z.literal(""), z.string().regex(AMOUNT_RE)])
    .optional(),
});

export const reversalSchema = z.object({
  paymentId: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(5, { message: "Give a reason — this is permanent and audited" })
    .max(300),
});

/** Validated form values -> database shape. Server-side, once. */
export function normalizePaymentInput(values) {
  return {
    committeeId: values.committeeId,
    committeeMemberId: values.committeeMemberId,
    cycleNumber: values.cycleNumber,
    amountMinor: toMinor(values.amount, 2),
    paidAt: new Date(values.paidAt),
    method: values.method,
    referenceNumber: values.referenceNumber?.trim() || null,
    notes: values.notes?.trim() || null,
    lateFeeOverrideMinor:
      values.lateFeeOverride && values.lateFeeOverride !== ""
        ? toMinor(values.lateFeeOverride, 2)
        : null,
  };
}

export const paymentListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().trim().max(120).optional().default(""),
  sort: z.enum(["paidAt", "createdAt", "cycleNumber", "amountMinor"]).default("paidAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  committeeId: z.string().optional().default(""),
});

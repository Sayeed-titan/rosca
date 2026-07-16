import { z } from "zod";

/**
 * Saved payment account validation.
 *
 * VALIDATES ONLY — no `.transform()`, for the same reason as every other schema in
 * this codebase: it runs on the client (zodResolver) and again in the Server
 * Action, so it must be able to parse its own output. See tests/schema.test.js.
 */
export const PAYMENT_ACCOUNT_METHODS = [
  "BKASH",
  "NAGAD",
  "ROCKET",
  "BANK_TRANSFER",
  "CARD",
  "OTHER",
];

export const paymentAccountSchema = z.object({
  memberId: z.string().min(1),
  method: z.enum(PAYMENT_ACCOUNT_METHODS),
  accountNumber: z
    .string()
    .trim()
    .min(3, { message: "Enter a number or account id" })
    .max(64),
  label: z.string().trim().max(60).optional(),
  isDefault: z.boolean().optional().default(false),
});

export const removePaymentAccountSchema = z.object({
  id: z.string().min(1),
});

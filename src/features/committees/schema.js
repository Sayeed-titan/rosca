import { z } from "zod";

import { toMinor } from "@/core/money";

export const COMMITTEE_STATUSES = ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"];
export const DRAW_FREQUENCIES = ["WEEKLY", "MONTHLY"];
export const LATE_FEE_TYPES = ["NONE", "FLAT", "PERCENT"];
export const CURRENCIES = ["BDT", "USD", "EUR", "GBP", "INR", "PKR", "AED"];

/**
 * Committee validation.
 *
 * Like the member schema, this VALIDATES ONLY — no `.transform()`. The same schema
 * runs on the client (zodResolver) and again in the Server Action, so it must parse
 * its own output. Money conversion (major -> BigInt minor) happens once, server-side,
 * in normalizeCommitteeInput.
 *
 * Money arrives as a decimal STRING ("5000.50"), never a number: a JS number would
 * already have lost precision before validation ever saw it.
 */
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

const moneyString = (label) =>
  z
    .string()
    .trim()
    .min(1, { message: `${label} is required` })
    .regex(AMOUNT_RE, { message: `${label} must be an amount like 5000 or 5000.50` });

/** Plain object schema — kept unrefined so it stays `.extend()`-able. */
const committeeBase = z.object({
  name: z
    .string()
    .trim()
    .min(3, { message: "Name must be at least 3 characters" })
    .max(120),

  description: z.string().trim().max(1000).optional(),

  contribution: moneyString("Monthly amount"),
  currency: z.enum(CURRENCIES),

  totalMembers: z.coerce
    .number()
    .int()
    .min(2, { message: "A committee needs at least 2 members" })
    .max(200, { message: "200 members is the maximum" }),

  startDate: z
    .string()
    .min(1, { message: "Start date is required" })
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid date" }),

  endDate: z
    .string()
    .optional()
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), { message: "Invalid date" }),

  drawFrequency: z.enum(DRAW_FREQUENCIES),
  drawDay: z.coerce.number().int().min(1).max(31),
  gracePeriodDays: z.coerce.number().int().min(0).max(60),

  lateFeeType: z.enum(LATE_FEE_TYPES),
  lateFeeFlat: z.string().trim().optional(),
  /// Percent as a human types it ("2.5"); converted to integer bps server-side.
  lateFeePercent: z.string().trim().optional(),

  status: z.enum(COMMITTEE_STATUSES),
});

/**
 * Cross-field rules. Applied via a function because `.refine()` returns a schema
 * that can no longer be `.extend()`ed — so the base stays plain and the rules get
 * layered onto each variant.
 */
const withRules = (schema) =>
  schema
    .refine((v) => v.drawFrequency !== "WEEKLY" || v.drawDay <= 7, {
      message: "For a weekly draw, the day must be 1–7 (Mon–Sun)",
      path: ["drawDay"],
    })
    .refine((v) => v.lateFeeType !== "FLAT" || AMOUNT_RE.test(v.lateFeeFlat ?? ""), {
      message: "Enter the flat late fee amount",
      path: ["lateFeeFlat"],
    })
    .refine(
      (v) => v.lateFeeType !== "PERCENT" || AMOUNT_RE.test(v.lateFeePercent ?? ""),
      { message: "Enter the late fee percentage", path: ["lateFeePercent"] }
    )
    .refine((v) => !v.endDate || Date.parse(v.endDate) > Date.parse(v.startDate), {
      message: "End date must be after the start date",
      path: ["endDate"],
    });

export const committeeSchema = withRules(committeeBase);
export const committeeUpdateSchema = withRules(
  committeeBase.extend({ id: z.string().min(1) })
);

/** Minor units per major unit, by currency. All of ours happen to use 2. */
const CURRENCY_EXPONENT = { BDT: 2, USD: 2, EUR: 2, GBP: 2, INR: 2, PKR: 2, AED: 2 };

/**
 * Validated form values -> database shape. Server-side, applied exactly once.
 *
 * This is where "5000.50" becomes 500050n and "2.5"% becomes 250 bps. Both stay
 * integers from here on, all the way into Postgres.
 */
export function normalizeCommitteeInput(values) {
  const exponent = CURRENCY_EXPONENT[values.currency] ?? 2;

  return {
    name: values.name.trim(),
    description: values.description?.trim() || null,

    contributionMinor: toMinor(values.contribution, exponent),
    currency: values.currency,
    currencyExponent: exponent,

    totalMembers: values.totalMembers,
    startDate: new Date(values.startDate),
    endDate: values.endDate ? new Date(values.endDate) : null,

    drawFrequency: values.drawFrequency,
    drawDay: values.drawDay,
    gracePeriodDays: values.gracePeriodDays,

    lateFeeType: values.lateFeeType,
    lateFeeFlatMinor:
      values.lateFeeType === "FLAT" ? toMinor(values.lateFeeFlat, exponent) : 0n,
    // "2.5"% -> 250 bps. Multiply by 100 in minor-unit space (exponent 2) so the
    // percentage never round-trips through a float.
    lateFeePercentBps:
      values.lateFeeType === "PERCENT" ? Number(toMinor(values.lateFeePercent, 2)) : 0,

    status: values.status,
  };
}

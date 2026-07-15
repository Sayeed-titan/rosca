import { z } from "zod";

export const MEMBER_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED"];

/**
 * Member validation.
 *
 * IMPORTANT: this schema validates ONLY. It deliberately contains no `.transform()`.
 *
 * Why: the same schema runs twice — once in the browser via zodResolver, and again
 * in the Server Action (the browser's copy is a courtesy; the server's is the real
 * check). zodResolver hands the form its *parsed output*, so any transform would be
 * applied before submit, and the server would then be re-parsing already-transformed
 * data. A schema with `"" -> null` and `string -> Date` transforms cannot parse its
 * own output, so the second parse fails with "expected string, received null".
 *
 * Keeping the schema idempotent and doing normalisation separately
 * (normalizeMemberInput, server-side only) means validating twice is always safe.
 */
const optionalText = (max) => z.string().trim().max(max).optional();

export const memberSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, { message: "Name must be at least 2 characters" })
    .max(120),

  phone: z
    .string()
    .trim()
    .min(6, { message: "Enter a valid phone number" })
    .max(24),

  // "" is what an untouched optional input submits, and must stay valid.
  email: z
    .union([z.literal(""), z.email({ message: "Enter a valid email address" })])
    .optional(),

  nationalId: optionalText(50),
  address: optionalText(300),
  occupation: optionalText(120),
  emergencyContact: optionalText(60),
  photoUrl: optionalText(500),
  notes: optionalText(1000),

  status: z.enum(MEMBER_STATUSES),

  // A date input submits "YYYY-MM-DD". Validated as a string; converted in
  // normalizeMemberInput.
  joiningDate: z
    .string()
    .optional()
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), {
      message: "Enter a valid date",
    }),
});

export const memberUpdateSchema = memberSchema.extend({
  id: z.string().min(1),
});

/** "" and whitespace mean "not provided". */
const blankToNull = (value) => {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
};

/**
 * Convert validated form values into the shape the database wants.
 *
 * Server-side only, and applied exactly once — after validation, before persistence.
 *
 * Blank optional strings become NULL rather than "": Postgres treats NULLs as
 * distinct in a unique index, so two members without a National ID coexist happily,
 * whereas two with "" would collide on Member_organizationId_nationalId_key.
 */
export function normalizeMemberInput(values) {
  return {
    fullName: values.fullName.trim(),
    phone: values.phone.trim(),
    email: blankToNull(values.email),
    nationalId: blankToNull(values.nationalId),
    address: blankToNull(values.address),
    occupation: blankToNull(values.occupation),
    emergencyContact: blankToNull(values.emergencyContact),
    photoUrl: blankToNull(values.photoUrl),
    notes: blankToNull(values.notes),
    status: values.status,
    joiningDate: values.joiningDate ? new Date(values.joiningDate) : new Date(),
  };
}

/** Query params for the members list. */
export const memberListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().trim().max(120).optional().default(""),
  sort: z.enum(["fullName", "joiningDate", "createdAt", "status"]).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  status: z.enum([...MEMBER_STATUSES, "ALL"]).default("ALL"),
});

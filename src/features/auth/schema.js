/**
 * Auth validation. Shared by the client form and the server action — the client
 * copy is for fast feedback, the server copy is the one that actually matters,
 * since anyone can POST to a Server Action without ever loading our form.
 */
import { z } from "zod";

export const loginSchema = z.object({
  // Zod 4: z.email() replaces the deprecated z.string().email().
  email: z.email({ message: "Enter a valid email address" }),
  password: z.string().min(1, { message: "Enter your password" }),
});

/**
 * Signup — creates the person AND their organization in one step.
 *
 * The org name is asked for here rather than on a second screen because the
 * schema has no concept of a user without an organization: every business row
 * hangs off one. An account with no org would land on /no-organization and be
 * able to do precisely nothing.
 *
 * VALIDATES ONLY — no `.transform()`. Same rule as every other schema here: it
 * runs on the client via zodResolver AND again in the Server Action, so it must
 * be able to parse its own output. See tests/schema.test.js.
 */
export const signupSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, { message: "Enter your name" })
      .max(120),
    email: z.email({ message: "Enter a valid email address" }),
    organizationName: z
      .string()
      .trim()
      .min(2, { message: "Enter your organization's name" })
      .max(120),
    // 8 is the floor, not the goal. Argon2id does the real work; a length rule
    // that's too strict just pushes people toward Password1! patterns.
    password: z
      .string()
      .min(8, { message: "Use at least 8 characters" })
      .max(200),
    confirmPassword: z.string().min(1, { message: "Confirm your password" }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

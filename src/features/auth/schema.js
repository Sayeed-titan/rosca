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

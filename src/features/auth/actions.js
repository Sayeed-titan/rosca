"use server";

import { AuthError } from "next-auth";

import { signIn, signOut } from "@/core/auth";
import { loginSchema } from "./schema";
import { ok, err } from "@/core/result";
import { ErrorCode } from "@/core/errors";

/**
 * Sign in with email + password.
 *
 * Note `redirect: false`. Auth.js's signIn normally throws a NEXT_REDIRECT to
 * navigate, which is control flow rather than an error — catching it to show a
 * message would swallow the redirect, and rethrowing it correctly is easy to get
 * wrong. Returning a Result and letting the client navigate keeps the failure path
 * explicit.
 */
export async function loginAction(input) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return err(ErrorCode.VALIDATION, "Check your details and try again.", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // Deliberately identical for "no such user" and "wrong password" — telling
      // them apart hands an attacker a list of valid accounts.
      return err(
        ErrorCode.UNAUTHENTICATED,
        "Incorrect email or password."
      );
    }
    throw error;
  }

  return ok({ redirectTo: "/dashboard" });
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

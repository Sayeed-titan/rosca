"use server";

import { AuthError } from "next-auth";

import { signIn, signOut } from "@/core/auth";
import { getActor } from "@/core/auth/session";
import { landingPathFor } from "@/core/auth/landing";
import { loginSchema, signupSchema } from "./schema";
import { registerOwner } from "./signup-service";
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

  // Read the session back rather than assuming /dashboard: a MEMBER has no
  // ORG_VIEW and would land on a "no access" wall the moment they signed in.
  const actor = await getActor();
  return ok({ redirectTo: landingPathFor(actor) });
}

/**
 * Register a new owner + their organization, then sign them straight in.
 *
 * Signing in here rather than bouncing to /login is deliberate: making someone
 * retype the password they just chose, seconds after choosing it, is friction
 * with no security benefit — they've already proved they know it.
 *
 * If the sign-in somehow fails, the account still exists and is valid, so we say
 * so and send them to /login rather than implying the signup failed.
 */
export async function signupAction(input) {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return err(ErrorCode.VALIDATION, "Please fix the highlighted fields.", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const result = await registerOwner(parsed.data);
  if (!result.ok) return result;

  try {
    await signIn("credentials", {
      email: parsed.data.email.trim().toLowerCase(),
      password: parsed.data.password,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return ok({ redirectTo: "/login", needsManualLogin: true });
    }
    throw error;
  }

  return ok({ redirectTo: "/dashboard" });
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

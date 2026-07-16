import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, Dices, ReceiptText, CircleDollarSign } from "lucide-react";

import { getActor } from "@/core/auth/session";
import { SignupForm } from "@/features/auth/components/signup-form";

export const metadata = { title: "Create your organization" };

const HIGHLIGHTS = [
  {
    icon: Dices,
    title: "Provably fair draws",
    body: "Every draw commits to a hashed seed beforehand and reveals it after, so any member can verify the result themselves.",
  },
  {
    icon: CircleDollarSign,
    title: "Money that can't drift",
    body: "Amounts are stored as exact integers and payments are append-only. Corrections are reversals, never edits.",
  },
  {
    icon: ReceiptText,
    title: "Complete audit trail",
    body: "Every login, payment and draw is recorded in the same transaction as the change itself.",
  },
];

export default async function SignupPage() {
  // Already signed in? Creating a second org from here would be confusing.
  const actor = await getActor();
  if (actor) redirect("/dashboard");

  return (
    <main className="app-backdrop grid min-h-svh lg:grid-cols-2">
      {/* Brand panel — hidden on small screens where it would just push the form down. */}
      <section className="relative hidden flex-col justify-between p-10 lg:flex xl:p-14">
        <div className="flex items-center gap-2.5">
          <div className="brand-gradient grid size-9 place-items-center rounded-xl shadow-lg">
            <CircleDollarSign className="size-5 text-white" aria-hidden="true" />
          </div>
          <span className="text-lg font-semibold tracking-tight">CircleFund</span>
        </div>

        <div className="max-w-md space-y-8">
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight text-balance xl:text-5xl">
              Start your committee{" "}
              <span className="brand-text-gradient">in a minute</span>
            </h1>
            <p className="text-muted-foreground text-pretty">
              Create your organization, add the members, and collect the first
              cycle. No spreadsheets, no arguments about whose turn it is.
            </p>
          </div>

          <ul className="space-y-5">
            {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3.5">
                <div className="glass mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg">
                  <Icon className="text-brand-1 size-4" aria-hidden="true" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-muted-foreground text-sm text-pretty">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Role-based access · audit logged · tenant isolated
        </p>
      </section>

      {/* Form panel */}
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="glass w-full max-w-md rounded-2xl p-8 sm:p-10">
          <div className="mb-8 space-y-2">
            <div className="mb-6 flex items-center gap-2.5 lg:hidden">
              <div className="brand-gradient grid size-8 place-items-center rounded-lg">
                <CircleDollarSign className="size-4 text-white" aria-hidden="true" />
              </div>
              <span className="font-semibold tracking-tight">CircleFund</span>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Create your organization
            </h2>
            <p className="text-muted-foreground text-sm">
              You&apos;ll be the owner, with full control over committees, members
              and draws.
            </p>
          </div>

          <SignupForm />

          <div className="border-border/60 mt-8 border-t pt-5">
            <p className="text-muted-foreground text-sm">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-foreground font-medium underline underline-offset-4"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

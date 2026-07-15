import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ShieldCheck, Dices, ReceiptText, CircleDollarSign } from "lucide-react";

import { getActor } from "@/core/auth/session";
import { LoginForm } from "@/features/auth/components/login-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Sign in" };

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

export default async function LoginPage() {
  // Already signed in? Don't show a login form.
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
              Run your committee{" "}
              <span className="brand-text-gradient">without the arguments</span>
            </h1>
            <p className="text-muted-foreground text-pretty">
              ROSCA, Committee, Chit Fund, Samity — whatever you call it, the hard
              part is trust. CircleFund makes the draw verifiable and the books
              exact.
            </p>
          </div>

          <ul className="space-y-5">
            {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3.5">
                <div className="glass mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg">
                  <Icon className="size-4 text-brand-1" aria-hidden="true" />
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
            <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
            <p className="text-muted-foreground text-sm">
              Sign in to manage your committees.
            </p>
          </div>

          {/* useSearchParams needs a Suspense boundary — without it the whole route
              opts out of static rendering. */}
          <Suspense fallback={<Skeleton className="h-64 w-full rounded-lg" />}>
            <LoginForm />
          </Suspense>

          <div className="border-border/60 mt-8 border-t pt-5">
            <p className="text-muted-foreground mb-2 text-xs font-medium">
              Demo accounts — password{" "}
              <code className="bg-muted rounded px-1 py-0.5 font-mono">Password123!</code>
            </p>
            <ul className="text-muted-foreground grid gap-1 text-xs">
              <li className="flex justify-between gap-2">
                <code className="font-mono">owner@circlefund.dev</code>
                <span>Org owner</span>
              </li>
              <li className="flex justify-between gap-2">
                <code className="font-mono">manager@circlefund.dev</code>
                <span>Manager</span>
              </li>
              <li className="flex justify-between gap-2">
                <code className="font-mono">member@circlefund.dev</code>
                <span>Member</span>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}

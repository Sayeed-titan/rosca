import { Building2 } from "lucide-react";

import { requireActor } from "@/core/auth/session";
import { logoutAction } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";

export const metadata = { title: "No organization" };

/**
 * A signed-in user with no organization membership.
 *
 * This is a real state, not an error: a super admin who hasn't picked an org, or an
 * account created before being invited anywhere. Showing an honest dead-end beats
 * dumping them on a dashboard that would throw.
 */
export default async function NoOrganizationPage() {
  const actor = await requireActor();

  return (
    <main className="app-backdrop grid min-h-svh place-items-center p-6">
      <div className="glass w-full max-w-md space-y-5 rounded-2xl p-8 text-center">
        <div className="bg-muted mx-auto grid size-12 place-items-center rounded-xl">
          <Building2 className="text-muted-foreground size-5" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">
            You&apos;re not in an organization yet
          </h1>
          <p className="text-muted-foreground text-sm text-pretty">
            {actor.email} isn&apos;t a member of any organization. Ask an owner to
            invite you, and this page will turn into your dashboard.
          </p>
        </div>

        <form action={logoutAction}>
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  );
}

import Link from "next/link";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Shown when a signed-in user reaches a page their role doesn't allow.
 *
 * Deliberately a plain component rather than Next's `forbidden()`, which is still
 * experimental and needs `experimental.authInterrupts`. Authorization in a money
 * app shouldn't depend on an experimental API that could change under us.
 *
 * This is defence in depth, not the control: the service layer already refuses.
 * This just makes the refusal legible instead of throwing.
 */
export function ForbiddenState({
  title = "You don't have access to this",
  description = "Your role doesn't include this area. If you think that's wrong, ask an organization owner.",
}) {
  return (
    <Card className="glass mx-auto mt-10 max-w-md rounded-xl border-0 p-8 text-center">
      <div className="bg-muted mx-auto grid size-12 place-items-center rounded-xl">
        <Lock className="text-muted-foreground size-5" aria-hidden="true" />
      </div>
      <h1 className="mt-4 font-medium">{title}</h1>
      <p className="text-muted-foreground mt-1 text-sm text-pretty">{description}</p>
      {/* Base UI composes via `render`, not Radix's `asChild`. */}
      <Button render={<Link href="/dashboard" />} variant="outline" className="mt-5">
        Back to dashboard
      </Button>
    </Card>
  );
}

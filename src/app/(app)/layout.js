import { redirect } from "next/navigation";

import { getActor } from "@/core/auth/session";
import { can } from "@/core/auth/rbac";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { AppShell } from "@/components/layout/app-shell";

/**
 * The authenticated layout.
 *
 * This redirect is the real gate, not proxy.js. proxy.js only checked that a
 * session cookie was *present* — here we resolve the actual session against the
 * database. A forged cookie gets past the proxy and dies here.
 */
export default async function AppLayout({ children }) {
  const actor = await getActor();

  if (!actor) {
    redirect("/login");
  }

  if (!actor.organizationId) {
    redirect("/no-organization");
  }

  const allowedHrefs = NAV_ITEMS.filter((item) =>
    can(actor, item.permission)
  ).map((item) => item.href);

  // Pass only what the client needs. Nothing sensitive crosses the boundary.
  const actorForClient = {
    name: actor.name,
    email: actor.email,
    role: actor.role,
    isSuperAdmin: actor.isSuperAdmin,
    organizationId: actor.organizationId,
    memberships: actor.memberships,
  };

  return (
    <AppShell actor={actorForClient} allowedHrefs={allowedHrefs}>
      {children}
    </AppShell>
  );
}

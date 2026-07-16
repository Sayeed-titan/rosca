"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CircleDollarSign, LogOut, Menu, X, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "./theme-toggle";
import { CommitteeSwitcher } from "./committee-switcher";
import { NAV_ITEMS } from "./nav-items";
import { logoutAction } from "@/features/auth/actions";

const ROLE_LABEL = {
  ORG_OWNER: "Owner",
  MANAGER: "Manager",
  MEMBER: "Member",
};

function initials(name, email) {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

/**
 * The authenticated shell.
 *
 * The server decides which links this user may see and passes `allowedHrefs` —
 * plain strings, because Lucide icons are React components and can't cross the
 * Server/Client serialization boundary. The icons are resolved here instead.
 *
 * Filtering is cosmetic: the service layer is what actually refuses.
 */
export function AppShell({ actor, allowedHrefs, committees, currentCommitteeId, children }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = NAV_ITEMS.filter((item) => allowedHrefs.includes(item.href));

  const org = actor.memberships.find(
    (m) => m.organizationId === actor.organizationId
  )?.organization;

  const nav = (
    <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
      {navItems.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");

        if (item.soon) {
          return (
            <span
              key={item.href}
              aria-disabled="true"
              title="Coming in a later phase"
              className="text-muted-foreground/50 flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm"
            >
              <item.icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="flex-1">{item.label}</span>
              <span className="text-[10px] uppercase tracking-wide">Soon</span>
            </span>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className="size-4 shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const sidebarBody = (
    <>
      <Link href="/dashboard" className="flex items-center gap-2.5 px-1 py-1">
        <div className="brand-gradient grid size-8 place-items-center rounded-lg shadow">
          <CircleDollarSign className="size-4 text-white" aria-hidden="true" />
        </div>
        <span className="font-semibold tracking-tight">CircleFund</span>
      </Link>

      {org && (
        <div className="glass mt-5 rounded-lg px-3 py-2.5">
          <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
            Organization
          </p>
          <p className="truncate text-sm font-medium">{org.name}</p>
        </div>
      )}

      <CommitteeSwitcher committees={committees} selectedId={currentCommitteeId} />

      <Separator className="my-5" />
      {nav}

      <div className="mt-auto space-y-3 pt-5">
        {actor.isSuperAdmin && (
          <Badge variant="secondary" className="w-full justify-center gap-1.5">
            <ShieldCheck className="size-3" aria-hidden="true" />
            Super admin
          </Badge>
        )}

        <div className="flex items-center gap-2.5">
          <Avatar className="size-8">
            <AvatarFallback className="text-xs">
              {initials(actor.name, actor.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {actor.name || actor.email}
            </p>
            <p className="text-muted-foreground truncate text-xs">
              {ROLE_LABEL[actor.role] ?? "No role"}
            </p>
          </div>
          <form action={logoutAction}>
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              aria-label="Sign out"
            >
              <LogOut className="size-4" />
            </Button>
          </form>
        </div>
      </div>
    </>
  );

  return (
    <div className="app-backdrop flex min-h-svh">
      {/* Desktop sidebar */}
      <aside className="border-border/60 hidden w-64 shrink-0 flex-col border-r p-4 lg:flex">
        {sidebarBody}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="bg-background/80 absolute inset-0 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="bg-background border-border absolute inset-y-0 left-0 flex w-72 flex-col border-r p-4 shadow-xl">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-3 top-3"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X className="size-4" />
            </Button>
            {sidebarBody}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border/60 flex h-14 items-center gap-2 border-b px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-4" />
          </Button>
          <div className="flex-1" />
          <ThemeToggle />
        </header>

        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

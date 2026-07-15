import {
  Landmark,
  Users,
  Wallet,
  TriangleAlert,
  Dices,
  CalendarClock,
  CircleCheckBig,
  Activity,
} from "lucide-react";

import { requireOrgActor } from "@/core/auth/session";
import { getDashboardStats } from "@/features/dashboard/service";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { formatMoney } from "@/core/money";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Dashboard" };

// Money must never be served stale from a cache.
export const dynamic = "force-dynamic";

const ACTION_LABEL = {
  "auth.login": "signed in",
  "auth.login_failed": "failed to sign in",
  "auth.logout": "signed out",
  "member.create": "added a member",
  "member.update": "updated a member",
  "committee.create": "created a committee",
  "payment.create": "recorded a payment",
  "payment.reverse": "reversed a payment",
  "draw.run": "ran a draw",
  "draw.override": "overrode a draw",
};

function formatWhen(iso) {
  const then = new Date(iso);
  const diffMs = Date.now() - then.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default async function DashboardPage() {
  const actor = await requireOrgActor();
  const stats = await getDashboardStats(actor.organizationId);

  const money = (minor) => formatMoney(minor, stats.currency, stats.exponent);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          {actor.name ? `Welcome back, ${actor.name.split(" ")[0]}.` : "Welcome back."}{" "}
          Here&apos;s where your committees stand.
        </p>
      </header>

      <section
        aria-label="Key metrics"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          icon={Landmark}
          label="Committees"
          value={stats.totalCommittees}
          hint={`${stats.activeCommittees} active`}
          tone="brand"
        />
        <StatCard
          icon={Users}
          label="Active members"
          value={stats.activeMembers}
          hint="Across all committees"
        />
        <StatCard
          icon={Wallet}
          label="Money collected"
          value={money(stats.collectedMinor)}
          hint="Net of reversals"
          tone="success"
        />
        <StatCard
          icon={TriangleAlert}
          label="Outstanding"
          value={money(stats.outstandingMinor)}
          hint="Due to date, not yet received"
          tone={stats.outstandingMinor === "0" ? "muted" : "warning"}
        />

        <StatCard
          icon={CalendarClock}
          label="Per-cycle target"
          value={money(stats.perCycleTargetMinor)}
          hint="Full pot across active committees"
        />
        <StatCard
          icon={Dices}
          label="Draws run"
          value={stats.drawsRun}
          hint="All verifiable from their seed"
        />
        <StatCard
          icon={CircleCheckBig}
          label="Completed"
          value={stats.completedCommittees}
          hint="Every member paid out"
        />
        <StatCard
          icon={CalendarClock}
          label="Upcoming draw"
          value={
            stats.upcoming
              ? new Date(stats.upcoming.dueDate).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                })
              : "—"
          }
          hint={
            stats.upcoming
              ? `${stats.upcoming.committeeName} · cycle ${stats.upcoming.cycleNumber}`
              : "Nothing scheduled"
          }
          tone={stats.upcoming ? "brand" : "muted"}
        />
      </section>

      <section aria-label="Recent activity">
        <Card className="glass rounded-xl border-0 p-5">
          <div className="mb-4 flex items-center gap-2">
            <Activity className="text-muted-foreground size-4" aria-hidden="true" />
            <h2 className="text-sm font-medium">Recent activity</h2>
          </div>

          {stats.recentActivity.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-muted-foreground text-sm">Nothing recorded yet.</p>
              <p className="text-muted-foreground/70 mt-1 text-xs">
                Every login, payment and draw will appear here.
              </p>
            </div>
          ) : (
            <ul className="divide-border/60 divide-y">
              {stats.recentActivity.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{item.actorName}</span>{" "}
                    <span className="text-muted-foreground">
                      {ACTION_LABEL[item.action] ?? item.action}
                    </span>
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {formatWhen(item.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

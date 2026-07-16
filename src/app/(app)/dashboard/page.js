import {
  Landmark,
  Users,
  Wallet,
  TriangleAlert,
  Dices,
  CalendarClock,
  Activity,
  Plus,
} from "lucide-react";
import Link from "next/link";

import { requireOrgActor } from "@/core/auth/session";
import { forOrganization } from "@/core/db/tenant";
import { getResolvedCurrentCommittee } from "@/core/current-committee";
import { getDashboardStats } from "@/features/dashboard/service";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { formatMoney } from "@/core/money";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/empty-state";

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
  "payment.bulk_create": "recorded a batch of payments",
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
  const db = forOrganization(actor.organizationId);
  const { committees, current } = await getResolvedCurrentCommittee(db);

  if (!current) {
    return (
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            {actor.name ? `Welcome back, ${actor.name.split(" ")[0]}.` : "Welcome back."}
          </p>
        </header>
        <Card className="glass rounded-xl border-0 p-0">
          <EmptyState
            icon={Landmark}
            title="No committees yet"
            description="Create your first committee to start collecting and see it here."
            action={
              <Button render={<Link href="/committees" />}>
                <Plus className="size-4" />
                Create a committee
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  const stats = await getDashboardStats(actor.organizationId, current.id);
  const money = (minor) => formatMoney(minor, stats.currency, stats.exponent);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            {actor.name ? `Welcome back, ${actor.name.split(" ")[0]}.` : "Welcome back."}{" "}
            Showing <span className="text-foreground font-medium">{stats.committeeName}</span>.
            {committees.length > 1 && " Switch committees from the sidebar."}
          </p>
        </div>
        <Badge variant={stats.committeeStatus === "ACTIVE" ? "secondary" : "outline"}>
          {stats.committeeStatus.charAt(0) + stats.committeeStatus.slice(1).toLowerCase()}
        </Badge>
      </header>

      <section
        aria-label="Key metrics"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          icon={Users}
          label="Members"
          value={stats.uniqueMembers}
          hint={`${stats.seatCount} seat${stats.seatCount === 1 ? "" : "s"}`}
        />
        <StatCard
          icon={Wallet}
          label="Money collected"
          value={money(stats.collectedMinor)}
          hint="Net of reversals, this committee"
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
          label="Pot per cycle"
          value={stats.potDisplay}
          hint={`${stats.seatCount} seats × contribution`}
          tone="brand"
        />

        <StatCard
          icon={Dices}
          label="Draws run"
          value={stats.drawsRun}
          hint={`${stats.cyclesRemaining} cycle${stats.cyclesRemaining === 1 ? "" : "s"} remaining`}
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
          hint={stats.upcoming ? `Cycle ${stats.upcoming.cycleNumber}` : "Nothing scheduled"}
          tone={stats.upcoming ? "brand" : "muted"}
        />
        <StatCard
          icon={Landmark}
          label="Committees"
          value={committees.length}
          hint="In your organization"
        />
      </section>

      <section aria-label="Recent activity">
        <Card className="glass rounded-xl border-0 p-5">
          <div className="mb-4 flex items-center gap-2">
            <Activity className="text-muted-foreground size-4" aria-hidden="true" />
            <h2 className="text-sm font-medium">Recent activity</h2>
            <span className="text-muted-foreground text-xs">— organization-wide</span>
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

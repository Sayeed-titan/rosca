import Link from "next/link";
import { Dices as DicesIcon, Plus } from "lucide-react";

import { requireOrgActor } from "@/core/auth/session";
import { can } from "@/core/auth/rbac";
import { Permission } from "@/core/auth/permissions";
import { forOrganization } from "@/core/db/tenant";
import { getResolvedCurrentCommittee } from "@/core/current-committee";
import { PageHeader } from "@/components/common/page-header";
import { ForbiddenState } from "@/components/common/forbidden-state";
import { EmptyState } from "@/components/common/empty-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DrawsTable } from "@/features/draws/components/draws-table";
import { toDrawDto } from "@/features/draws/dto";

export const metadata = { title: "Draws" };
export const dynamic = "force-dynamic";

export default async function DrawsPage({ searchParams }) {
  const actor = await requireOrgActor();

  if (!can(actor, Permission.DRAW_VIEW)) {
    return <ForbiddenState />;
  }

  const db = forOrganization(actor.organizationId);
  const { current } = await getResolvedCurrentCommittee(db);

  if (!current) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Draws"
          description="Every draw commits to a hashed seed before spinning and reveals it after."
        />
        <Card className="glass rounded-xl border-0 p-0">
          <EmptyState
            icon={DicesIcon}
            title="No committee selected"
            description="Create a committee, or pick one from the sidebar, to run a draw."
            action={
              <Button render={<Link href="/committees" />}>
                <Plus className="size-4" />
                Go to committees
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const pageSize = 10;

  // Scoped to the sidebar's selected committee — draw history from other
  // committees is deliberately never mixed into this list.
  const [drawRows, total] = await Promise.all([
    db.draw.findMany({
      where: { committeeId: current.id },
      orderBy: { drawnAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        cycleNumber: true,
        drawnAt: true,
        payoutMinor: true,
        mode: true,
        isOverride: true,
        overrideReason: true,
        seedCommitment: true,
        serverSeed: true,
        eligibleSnapshot: true,
        winnerIndex: true,
        algorithmVersion: true,
        committee: { select: { id: true, name: true, currency: true, currencyExponent: true } },
        winner: {
          select: {
            id: true,
            position: true,
            member: { select: { id: true, fullName: true, photoUrl: true } },
          },
        },
        conductedBy: { select: { name: true, email: true } },
      },
    }),
    db.draw.count({ where: { committeeId: current.id } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Draws"
        description={`${current.name} — every draw commits to a hashed seed before spinning and reveals it after, so any member can check the result themselves.`}
      />

      <DrawsTable
        rows={drawRows.map(toDrawDto)}
        total={total}
        pageSize={pageSize}
        committees={[current]}
        can={{
          run: can(actor, Permission.DRAW_RUN),
          override: can(actor, Permission.DRAW_OVERRIDE),
        }}
      />
    </div>
  );
}

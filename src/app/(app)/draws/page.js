import { requireOrgActor } from "@/core/auth/session";
import { can } from "@/core/auth/rbac";
import { Permission } from "@/core/auth/permissions";
import { forOrganization } from "@/core/db/tenant";
import { PageHeader } from "@/components/common/page-header";
import { ForbiddenState } from "@/components/common/forbidden-state";
import { DrawsTable } from "@/features/draws/components/draws-table";
import { toDrawDto } from "@/features/draws/dto";

export const metadata = { title: "Draws" };
export const dynamic = "force-dynamic";

export default async function DrawsPage({ searchParams }) {
  const actor = await requireOrgActor();

  if (!can(actor, Permission.DRAW_VIEW)) {
    return <ForbiddenState />;
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const pageSize = 10;

  const db = forOrganization(actor.organizationId);

  const [drawRows, total, committees] = await Promise.all([
    db.draw.findMany({
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
    db.draw.count(),
    db.committee.findMany({
      where: { deletedAt: null, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Draws"
        description="Every draw commits to a hashed seed before spinning and reveals it after — so any member can check the result themselves rather than taking your word for it."
      />

      <DrawsTable
        rows={drawRows.map(toDrawDto)}
        total={total}
        pageSize={pageSize}
        committees={committees}
        can={{
          run: can(actor, Permission.DRAW_RUN),
          override: can(actor, Permission.DRAW_OVERRIDE),
        }}
      />
    </div>
  );
}

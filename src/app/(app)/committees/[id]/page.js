import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireOrgActor } from "@/core/auth/session";
import { can } from "@/core/auth/rbac";
import { Permission } from "@/core/auth/permissions";
import { forOrganization } from "@/core/db/tenant";
import { ForbiddenState } from "@/components/common/forbidden-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import * as seatService from "@/features/committees/seats/service";
import { SeatsPanel } from "@/features/committees/seats/components/seats-panel";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  // params is a Promise in Next 16.
  const { id } = await params;
  const actor = await requireOrgActor();
  const db = forOrganization(actor.organizationId);
  const committee = await db.committee.findUnique({
    where: { id },
    select: { name: true },
  });
  return { title: committee?.name ?? "Committee" };
}

export default async function CommitteeDetailPage({ params }) {
  const actor = await requireOrgActor();

  if (!can(actor, Permission.COMMITTEE_VIEW)) {
    return <ForbiddenState />;
  }

  const { id } = await params;
  const db = forOrganization(actor.organizationId);

  const result = await seatService.listSeats(db, id);
  if (!result.ok) notFound();

  const { committee } = result.data;

  // Members available to assign, with how many seats they already hold — so the
  // dialog can warn before doubling someone's monthly obligation.
  const memberRows = await db.member.findMany({
    where: { deletedAt: null, status: "ACTIVE" },
    select: {
      id: true,
      fullName: true,
      _count: {
        select: { committeeMembers: { where: { committeeId: id, deletedAt: null } } },
      },
    },
    orderBy: { fullName: "asc" },
  });

  const members = memberRows.map((m) => ({
    id: m.id,
    fullName: m.fullName,
    seatsHeld: m._count.committeeMembers,
  }));

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button
          render={<Link href="/committees" />}
          variant="ghost"
          size="sm"
          className="-ml-2"
        >
          <ArrowLeft className="size-4" />
          All committees
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight">{committee.name}</h1>
              <Badge variant={committee.status === "ACTIVE" ? "secondary" : "outline"}>
                {committee.status.charAt(0) + committee.status.slice(1).toLowerCase()}
              </Badge>
            </div>
            {committee.description && (
              <p className="text-muted-foreground text-sm text-pretty">
                {committee.description}
              </p>
            )}
          </div>

          <dl className="flex gap-6 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                Per seat
              </dt>
              <dd className="tabular font-semibold">{committee.contributionDisplay}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                Pot / cycle
              </dt>
              <dd className="brand-text-gradient tabular font-semibold">
                {committee.potDisplay}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <SeatsPanel
        data={result.data}
        members={members}
        can={{ assign: can(actor, Permission.COMMITTEE_ASSIGN_MEMBERS) }}
      />
    </div>
  );
}

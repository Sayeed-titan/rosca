import { UserRound } from "lucide-react";

import { requireOrgActor } from "@/core/auth/session";
import { forOrganization } from "@/core/db/tenant";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Card } from "@/components/ui/card";
import { getPortalData } from "@/features/portal/service";
import { PortalView } from "@/features/portal/components/portal-view";

export const metadata = { title: "My committees" };
export const dynamic = "force-dynamic";

/**
 * The member's own view.
 *
 * No permission check beyond being signed in: this shows the actor their OWN
 * data, scoped by their userId. There is nothing here to authorise — a member
 * with no linked Member record simply sees the empty state.
 */
export default async function PortalPage() {
  const actor = await requireOrgActor();
  const db = forOrganization(actor.organizationId);

  const data = await getPortalData(db, actor.userId);

  const empty = (
    <Card className="glass rounded-xl border-0 p-0">
      <EmptyState
        icon={UserRound}
        title="You're not in any committee yet"
        description="Once an organiser assigns you a seat, your payments, position and upcoming draws will appear here."
      />
    </Card>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="My committees"
        description={
          data?.member
            ? `${data.member.fullName} — your payments, your position, and when your turn comes.`
            : "Your payments, your position, and when your turn comes."
        }
      />

      {!data || data.committees.length === 0 ? (
        empty
      ) : (
        <PortalView committees={data.committees} />
      )}
    </div>
  );
}

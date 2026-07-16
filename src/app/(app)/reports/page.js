import { Suspense } from "react";
import Link from "next/link";
import { BarChart3, Plus } from "lucide-react";

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
import { Skeleton } from "@/components/ui/skeleton";
import { buildReport, REPORTS, REPORT_KEYS } from "@/features/reports/service";
import { ReportView } from "@/features/reports/components/report-view";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }) {
  const actor = await requireOrgActor();

  if (!can(actor, Permission.REPORT_VIEW)) {
    return <ForbiddenState />;
  }

  const db = forOrganization(actor.organizationId);
  const { current } = await getResolvedCurrentCommittee(db);

  if (!current) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" description="Collection, outstanding, ledgers and history." />
        <Card className="glass rounded-xl border-0 p-0">
          <EmptyState
            icon={BarChart3}
            title="No committee selected"
            description="Create a committee, or pick one from the sidebar, to see its reports."
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
  // Allow-list the key — it indexes into REPORTS, so an arbitrary value would
  // otherwise be an unchecked lookup from the URL.
  const activeKey = REPORT_KEYS.includes(sp.report) ? sp.report : "collection";

  const report = await buildReport(db, current.id, activeKey);

  const reportKeys = REPORT_KEYS.map((key) => ({ key, label: REPORTS[key].label }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description={`${current.name} — every figure computed from the ledger at read time, so a report can never disagree with the payments behind it.`}
      />

      {/* useSearchParams needs a Suspense boundary or the route opts out of
          static rendering entirely. */}
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <ReportView report={report} reportKeys={reportKeys} activeKey={activeKey} />
      </Suspense>
    </div>
  );
}

import { requireOrgActor } from "@/core/auth/session";
import { can } from "@/core/auth/rbac";
import { Permission } from "@/core/auth/permissions";
import { forOrganization } from "@/core/db/tenant";
import { PageHeader } from "@/components/common/page-header";
import { ForbiddenState } from "@/components/common/forbidden-state";
import { listAuditLogs, listAuditActors } from "@/features/audit/service";
import { AuditTable } from "@/features/audit/components/audit-table";

export const metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }) {
  const actor = await requireOrgActor();

  if (!can(actor, Permission.AUDIT_VIEW)) {
    return <ForbiddenState />;
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const pageSize = 25;

  const filters = {
    action: sp.action || "ALL",
    actorUserId: sp.actor || "ALL",
  };

  const db = forOrganization(actor.organizationId);

  const [{ rows, total }, actors] = await Promise.all([
    listAuditLogs(db, { page, pageSize, q: sp.q ?? "", ...filters }),
    listAuditActors(db),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Every sign-in, payment, committee change and draw — recorded in the same transaction as the change itself, so it can't fall out of sync. Read-only, by design."
      />

      <AuditTable
        rows={rows}
        total={total}
        pageSize={pageSize}
        actors={actors}
        filters={filters}
      />
    </div>
  );
}

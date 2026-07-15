import { requireOrgActor } from "@/core/auth/session";
import { can } from "@/core/auth/rbac";
import { Permission } from "@/core/auth/permissions";
import { forOrganization } from "@/core/db/tenant";
import { PageHeader } from "@/components/common/page-header";
import { ForbiddenState } from "@/components/common/forbidden-state";
import { committeeListSchema } from "@/features/committees/schema";
import * as service from "@/features/committees/service";
import { CommitteesTable } from "@/features/committees/components/committees-table";

export const metadata = { title: "Committees" };
export const dynamic = "force-dynamic";

/** Allow-list so `?sort=` can only name real, safe columns. */
const ALLOWED_SORT = new Set(["name", "startDate", "createdAt", "status"]);

export default async function CommitteesPage({ searchParams }) {
  const actor = await requireOrgActor();

  if (!can(actor, Permission.COMMITTEE_VIEW)) {
    return <ForbiddenState />;
  }

  // searchParams is a Promise in Next 16.
  const sp = await searchParams;

  const params = committeeListSchema.parse({
    page: sp.page ?? 1,
    pageSize: 10,
    q: sp.q ?? "",
    sort: ALLOWED_SORT.has(sp.sort) ? sp.sort : "createdAt",
    dir: sp.dir === "asc" ? "asc" : "desc",
    status: sp.status ?? "ALL",
  });

  const db = forOrganization(actor.organizationId);
  const { rows, total } = await service.listCommittees(db, params);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Committees"
        description="Each committee collects a fixed amount every cycle and pays the whole pot to one member, until everyone has had a turn."
      />

      <CommitteesTable
        rows={rows}
        total={total}
        pageSize={params.pageSize}
        can={{
          create: can(actor, Permission.COMMITTEE_CREATE),
          update: can(actor, Permission.COMMITTEE_UPDATE),
          delete: can(actor, Permission.COMMITTEE_DELETE),
        }}
      />
    </div>
  );
}

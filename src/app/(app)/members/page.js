import { requireOrgActor } from "@/core/auth/session";
import { can } from "@/core/auth/rbac";
import { Permission } from "@/core/auth/permissions";
import { forOrganization } from "@/core/db/tenant";
import { PageHeader } from "@/components/common/page-header";
import { ForbiddenState } from "@/components/common/forbidden-state";
import { memberListSchema } from "@/features/members/schema";
import * as service from "@/features/members/service";
import { MembersTable } from "@/features/members/components/members-table";

export const metadata = { title: "Members" };
export const dynamic = "force-dynamic";

export default async function MembersPage({ searchParams }) {
  const actor = await requireOrgActor();

  if (!can(actor, Permission.MEMBER_VIEW)) {
    return <ForbiddenState />;
  }

  // searchParams is a Promise in Next 16 — synchronous access was removed in v16,
  // not merely deprecated.
  const sp = await searchParams;

  // Parse rather than trust: these values come straight from the URL bar, so
  // ?pageSize=1000000 or ?sort=passwordHash must not reach the query builder.
  // `.parse` can't throw here because every field has a default.
  const params = memberListSchema.parse({
    page: sp.page ?? 1,
    pageSize: 10,
    q: sp.q ?? "",
    sort: ALLOWED_SORT.has(sp.sort) ? sp.sort : "createdAt",
    dir: sp.dir === "asc" ? "asc" : "desc",
    status: sp.status ?? "ALL",
  });

  const db = forOrganization(actor.organizationId);
  const { rows, total } = await service.listMembers(db, params);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Members"
        description="Everyone who takes part in your committees. A member can join more than one."
      />

      <MembersTable
        rows={rows}
        total={total}
        pageSize={params.pageSize}
        can={{
          create: can(actor, Permission.MEMBER_CREATE),
          update: can(actor, Permission.MEMBER_UPDATE),
          delete: can(actor, Permission.MEMBER_DELETE),
        }}
      />
    </div>
  );
}

/** Sortable columns. An allow-list, so `?sort=` can only name real, safe columns. */
const ALLOWED_SORT = new Set(["fullName", "joiningDate", "createdAt", "status"]);

import { requireOrgActor } from "@/core/auth/session";
import { can } from "@/core/auth/rbac";
import { Permission } from "@/core/auth/permissions";
import { forOrganization } from "@/core/db/tenant";
import { PageHeader } from "@/components/common/page-header";
import { ForbiddenState } from "@/components/common/forbidden-state";
import { paymentListSchema } from "@/features/payments/schema";
import * as service from "@/features/payments/service";
import { PaymentsTable } from "@/features/payments/components/payments-table";
import { toMajorString, formatMoney } from "@/core/money";
import { currentCycleNumber } from "@/core/cycles";

export const metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

const ALLOWED_SORT = new Set(["paidAt", "createdAt", "cycleNumber", "amountMinor"]);

export default async function PaymentsPage({ searchParams }) {
  const actor = await requireOrgActor();

  if (!can(actor, Permission.PAYMENT_VIEW)) {
    return <ForbiddenState />;
  }

  const sp = await searchParams;

  const params = paymentListSchema.parse({
    page: sp.page ?? 1,
    pageSize: 10,
    q: sp.q ?? "",
    sort: ALLOWED_SORT.has(sp.sort) ? sp.sort : "paidAt",
    dir: sp.dir === "asc" ? "asc" : "desc",
    committeeId: sp.committeeId ?? "",
  });

  const db = forOrganization(actor.organizationId);

  const [{ rows, total }, committeeRows] = await Promise.all([
    service.listPayments(db, params),
    // Committees plus their seats, so the form's member dropdown can cascade off
    // the committee without another request.
    db.committee.findMany({
      where: { deletedAt: null, status: { in: ["ACTIVE", "DRAFT"] } },
      select: {
        id: true,
        name: true,
        contributionMinor: true,
        currency: true,
        currencyExponent: true,
        totalSeats: true,
        startDate: true,
        drawFrequency: true,
        drawDay: true,
        members: {
          where: { deletedAt: null, status: "ACTIVE" },
          select: {
            id: true,
            position: true,
            member: { select: { fullName: true } },
          },
          orderBy: { position: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  // BigInt cannot cross the RSC boundary — flatten to strings here.
  const committees = committeeRows.map((c) => ({
    id: c.id,
    name: c.name,
    totalSeats: c.totalSeats,
    contribution: toMajorString(c.contributionMinor, c.currencyExponent),
    contributionDisplay: formatMoney(c.contributionMinor, c.currency, c.currencyExponent),
    suggestedCycle: currentCycleNumber(c),
    seats: c.members.map((s) => ({
      id: s.id,
      position: s.position,
      memberName: s.member.fullName,
    })),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Every contribution, recorded once and never edited. Corrections are reversals, so the history always reflects what actually happened."
      />

      <PaymentsTable
        rows={rows}
        total={total}
        pageSize={params.pageSize}
        committees={committees}
        can={{
          create: can(actor, Permission.PAYMENT_CREATE),
          reverse: can(actor, Permission.PAYMENT_REVERSE),
        }}
      />
    </div>
  );
}

import Link from "next/link";
import { Landmark, Plus } from "lucide-react";

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
import { paymentListSchema } from "@/features/payments/schema";
import * as service from "@/features/payments/service";
import { PaymentsTable } from "@/features/payments/components/payments-table";
import { BulkPaymentTable } from "@/features/payments/components/bulk-payment-table";
import { toMajorString, formatMoney } from "@/core/money";
import { currentCycleNumber } from "@/core/cycles";
import { netPaidForCycle } from "@/core/ledger";
import { listAccountsForOrg } from "@/features/members/payment-accounts/service";

export const metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

const ALLOWED_SORT = new Set(["paidAt", "createdAt", "cycleNumber", "amountMinor"]);

export default async function PaymentsPage({ searchParams }) {
  const actor = await requireOrgActor();

  if (!can(actor, Permission.PAYMENT_VIEW)) {
    return <ForbiddenState />;
  }

  const db = forOrganization(actor.organizationId);
  const { current } = await getResolvedCurrentCommittee(db);

  if (!current) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Payments"
          description="Every contribution, recorded once and never edited."
        />
        <Card className="glass rounded-xl border-0 p-0">
          <EmptyState
            icon={Landmark}
            title="No committee selected"
            description="Create a committee, or pick one from the sidebar, to record payments."
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

  // Scoped to the sidebar's selected committee, always — a payment page mixing
  // several committees' rows is exactly the confusion the switcher exists to
  // prevent, so the URL's own ?committeeId is deliberately never trusted here.
  const params = paymentListSchema.parse({
    page: sp.page ?? 1,
    pageSize: 10,
    q: sp.q ?? "",
    sort: ALLOWED_SORT.has(sp.sort) ? sp.sort : "paidAt",
    dir: sp.dir === "asc" ? "asc" : "desc",
    committeeId: current.id,
  });

  const [{ rows, total }, committeeRow, paymentAccounts] = await Promise.all([
    service.listPayments(db, params),
    db.committee.findUnique({
      where: { id: current.id },
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
            member: { select: { id: true, fullName: true } },
          },
          orderBy: { position: "asc" },
        },
        _count: { select: { draws: true } },
      },
    }),
    // Saved MFS/bank numbers, so the bulk table can auto-fill a reference number
    // once a payment method is picked, instead of retyping it every cycle.
    listAccountsForOrg(db),
  ]);

  const accountsByMember = new Map();
  for (const a of paymentAccounts) {
    const list = accountsByMember.get(a.memberId) ?? [];
    list.push(a);
    accountsByMember.set(a.memberId, list);
  }

  /**
   * Which cycle should we suggest?
   *
   * NOT the calendar month. This used to be `currentCycleNumber(c)`, which asks
   * "how many due dates have passed?" — for a committee that started in January
   * that answers 8. But the draw runs cycles strictly in order, so the cycle it
   * actually wants is `draws.length + 1` = 1. The cycle being settled is the next
   * one to be drawn. One definition, shared with the draw gate's own error text.
   */
  const nextCycle = Math.min(committeeRow._count.draws + 1, committeeRow.totalSeats);

  // Who has already paid the next cycle, so the bulk table can pre-uncheck (and
  // mark) seats that don't need re-entering.
  const relevantPayments = await db.payment.findMany({
    where: { committeeId: current.id, cycleNumber: nextCycle },
    select: { committeeMemberId: true, amountMinor: true },
  });
  const paidByMember = new Map();
  for (const p of relevantPayments) {
    const list = paidByMember.get(p.committeeMemberId) ?? [];
    list.push(p);
    paidByMember.set(p.committeeMemberId, list);
  }

  // Every downstream component (BulkPaymentTable, PaymentsTable's record dialog)
  // already accepts a `committees` array to drive its own picker — feeding it
  // exactly one entry collapses those pickers to "the selected committee" with
  // no further changes needed there, and makes mixing structurally impossible.
  const committees = [
    {
      id: committeeRow.id,
      name: committeeRow.name,
      totalSeats: committeeRow.totalSeats,
      contribution: toMajorString(committeeRow.contributionMinor, committeeRow.currencyExponent),
      contributionDisplay: formatMoney(
        committeeRow.contributionMinor,
        committeeRow.currency,
        committeeRow.currencyExponent
      ),
      suggestedCycle: nextCycle,
      nextDrawCycle: nextCycle,
      drawsRun: committeeRow._count.draws,
      calendarCycle: currentCycleNumber(committeeRow),
      seats: committeeRow.members.map((s) => {
        const paidMinor = netPaidForCycle(paidByMember.get(s.id) ?? []);
        return {
          id: s.id,
          position: s.position,
          memberId: s.member.id,
          memberName: s.member.fullName,
          isPaidForNextCycle: paidMinor >= committeeRow.contributionMinor,
          savedAccounts: (accountsByMember.get(s.member.id) ?? []).map((a) => ({
            id: a.id,
            method: a.method,
            accountNumber: a.accountNumber,
            label: a.label,
            isDefault: a.isDefault,
          })),
        };
      }),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description={`${committeeRow.name} — every contribution, recorded once and never edited. Corrections are reversals, so the history always reflects what actually happened.`}
      />

      {can(actor, Permission.PAYMENT_CREATE) && (
        <BulkPaymentTable committees={committees} />
      )}

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

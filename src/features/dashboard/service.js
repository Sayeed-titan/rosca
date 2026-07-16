import "server-only";

import { forOrganization } from "@/core/db/tenant";
import { sumMinor, potForCycle, formatMoney } from "@/core/money";
import { cyclesElapsed, nextDueDate } from "@/core/cycles";

/**
 * Dashboard aggregates — scoped to ONE committee at a time.
 *
 * Every number here is computed from the ledger, never read from a cached
 * counter. A stored "total collected" is a second source of truth, and the
 * moment it disagrees with the payments it summarises, the dashboard is lying
 * about money.
 *
 * Scoped rather than org-wide on purpose: mixing several committees' pots into
 * one "money collected" figure is exactly the kind of number nobody can act on —
 * it doesn't say whether the committee that's actually due is on track. The
 * sidebar's committee switcher is what decides which one this describes.
 */
export async function getDashboardStats(organizationId, committeeId) {
  const db = forOrganization(organizationId);
  const now = new Date();

  const committee = await db.committee.findUnique({
    where: { id: committeeId },
    select: {
      id: true,
      name: true,
      status: true,
      contributionMinor: true,
      totalSeats: true,
      startDate: true,
      drawFrequency: true,
      drawDay: true,
      currency: true,
      currencyExponent: true,
      _count: { select: { members: { where: { deletedAt: null } }, draws: true } },
    },
  });

  if (!committee) return null;

  const [paymentAgg, recentActivity, uniqueMembers] = await Promise.all([
    // Signed sum: REVERSAL rows are negative, so they subtract themselves and
    // the total stays correct without special-casing them.
    db.payment.aggregate({
      where: { committeeId },
      _sum: { amountMinor: true, lateFeeMinor: true },
    }),

    // The org's audit trail is naturally cross-cutting (logins, settings, etc),
    // so it isn't filtered to this committee — but every row it CAN name a
    // committee for, it does, so a reader can tell what's relevant at a glance.
    db.auditLog.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        action: true,
        entityType: true,
        createdAt: true,
        actor: { select: { name: true, email: true } },
      },
    }),

    db.committeeMember.findMany({
      where: { committeeId, deletedAt: null },
      select: { memberId: true },
      distinct: ["memberId"],
    }),
  ]);

  const collectedMinor =
    (paymentAgg._sum.amountMinor ?? 0n) + (paymentAgg._sum.lateFeeMinor ?? 0n);

  const seatCount = committee._count.members;
  const potMinor = potForCycle(committee.contributionMinor, seatCount);
  const elapsed = cyclesElapsed(committee, now);

  // Expected-to-date: the full pot for every cycle that's already come due.
  const expectedToDateMinor = potMinor * BigInt(elapsed);
  const outstandingMinor = expectedToDateMinor - collectedMinor;

  const next = nextDueDate(committee, now);
  const drawsRun = committee._count.draws;

  return {
    committeeId: committee.id,
    committeeName: committee.name,
    committeeStatus: committee.status,
    currency: committee.currency,
    exponent: committee.currencyExponent,

    seatCount,
    uniqueMembers: uniqueMembers.length,

    collectedMinor: collectedMinor.toString(),
    outstandingMinor: (outstandingMinor > 0n ? outstandingMinor : 0n).toString(),
    potDisplay: formatMoney(potMinor, committee.currency, committee.currencyExponent),

    drawsRun,
    cyclesRemaining: Math.max(0, seatCount - drawsRun),

    upcoming: next
      ? { cycleNumber: next.cycleNumber, dueDate: next.dueDate.toISOString() }
      : null,

    recentActivity: recentActivity.map((a) => ({
      id: a.id,
      action: a.action,
      entityType: a.entityType,
      createdAt: a.createdAt.toISOString(),
      actorName: a.actor?.name ?? a.actor?.email ?? "System",
    })),
  };
}

import "server-only";

import { forOrganization } from "@/core/db/tenant";
import { sumMinor, potForCycle } from "@/core/money";
import { cyclesElapsed, nextDueDate } from "@/core/cycles";

/**
 * Dashboard aggregates.
 *
 * Every number here is computed from the ledger, never read from a cached counter.
 * A stored "total collected" is a second source of truth, and the moment it
 * disagrees with the payments it summarises, the dashboard is lying about money.
 *
 * Returns plain JSON-safe values (BigInt -> string) since this feeds a Server
 * Component that hands props to client children.
 */
export async function getDashboardStats(organizationId) {
  const db = forOrganization(organizationId);
  const now = new Date();

  const [
    totalCommittees,
    activeCommittees,
    completedCommittees,
    activeMembers,
    drawsRun,
    paymentAgg,
    committees,
    recentActivity,
  ] = await Promise.all([
    db.committee.count({ where: { deletedAt: null } }),
    db.committee.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    db.committee.count({ where: { deletedAt: null, status: "COMPLETED" } }),
    db.member.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    db.draw.count(),

    // Signed sum: REVERSAL rows are negative, so they subtract themselves and the
    // total stays correct without special-casing them.
    db.payment.aggregate({ _sum: { amountMinor: true, lateFeeMinor: true } }),

    db.committee.findMany({
      where: { deletedAt: null, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        contributionMinor: true,
        totalMembers: true,
        startDate: true,
        drawFrequency: true,
        drawDay: true,
        currency: true,
        currencyExponent: true,
        _count: { select: { members: { where: { deletedAt: null } } } },
      },
    }),

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
  ]);

  const collectedMinor =
    (paymentAgg._sum.amountMinor ?? 0n) + (paymentAgg._sum.lateFeeMinor ?? 0n);

  // Expected-to-date: for each active committee, the full pot for every cycle that
  // has already come due. Outstanding is what that expectation minus what arrived.
  const expectedToDateMinor = sumMinor(
    committees.map((c) =>
      potForCycle(c.contributionMinor, c._count.members) *
      BigInt(cyclesElapsed(c, now))
    )
  );

  // One cycle's worth across all active committees — the "monthly collection" target.
  const perCycleTargetMinor = sumMinor(
    committees.map((c) => potForCycle(c.contributionMinor, c._count.members))
  );

  const outstandingMinor = expectedToDateMinor - collectedMinor;

  // The soonest upcoming due date across active committees.
  let upcoming = null;
  for (const c of committees) {
    const next = nextDueDate(c, now);
    if (!next) continue;
    if (!upcoming || next.dueDate < upcoming.dueDate) {
      upcoming = { ...next, committeeId: c.id, committeeName: c.name };
    }
  }

  const currency = committees[0]?.currency ?? "BDT";
  const exponent = committees[0]?.currencyExponent ?? 2;

  return {
    currency,
    exponent,
    totalCommittees,
    activeCommittees,
    completedCommittees,
    activeMembers,
    drawsRun,
    // BigInt is not JSON-serialisable — stringify at the boundary.
    collectedMinor: collectedMinor.toString(),
    outstandingMinor: (outstandingMinor > 0n ? outstandingMinor : 0n).toString(),
    perCycleTargetMinor: perCycleTargetMinor.toString(),
    upcoming: upcoming
      ? {
          committeeName: upcoming.committeeName,
          cycleNumber: upcoming.cycleNumber,
          dueDate: upcoming.dueDate.toISOString(),
        }
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

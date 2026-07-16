import "server-only";

import { formatMoney, potForCycle } from "@/core/money";
import { cycleDueDate, cycleGraceDeadline } from "@/core/cycles";
import { cycleStatusFor, CycleStatus } from "@/core/ledger";

/**
 * Calendar events — payment due dates and draw days.
 *
 * Derived from each committee's schedule rather than stored as rows: a due date
 * is a function of (startDate, frequency, drawDay, cycleNumber), so materialising
 * it into a table would just create something that could drift from the committee
 * it describes. Change the draw day and every future date should move — which it
 * does, for free, when they're computed.
 */

export async function getCalendarEvents(db, { from, to }) {
  const committees = await db.committee.findMany({
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
      gracePeriodDays: true,
      _count: { select: { members: { where: { deletedAt: null } }, draws: true } },
    },
  });

  const committeeIds = committees.map((c) => c.id);
  const payments = committeeIds.length
    ? await db.payment.findMany({
        where: { committeeId: { in: committeeIds } },
        select: {
          committeeId: true,
          committeeMemberId: true,
          cycleNumber: true,
          amountMinor: true,
        },
      })
    : [];

  const paymentsByCommittee = new Map();
  for (const p of payments) {
    const list = paymentsByCommittee.get(p.committeeId) ?? [];
    list.push(p);
    paymentsByCommittee.set(p.committeeId, list);
  }

  const events = [];
  const now = new Date();

  for (const committee of committees) {
    const seatCount = committee._count.members;
    if (seatCount === 0) continue;

    const potMinor = potForCycle(committee.contributionMinor, seatCount);
    const drawsRun = committee._count.draws;
    const committeePayments = paymentsByCommittee.get(committee.id) ?? [];

    for (let cycle = 1; cycle <= committee.totalSeats; cycle++) {
      const due = cycleDueDate(committee, cycle);
      if (due < from || due > to) continue;

      // How much of this cycle actually arrived — so the calendar can show
      // "collected" vs "still owed" rather than just a date.
      let collected = 0n;
      const bySeat = new Map();
      for (const p of committeePayments.filter((x) => x.cycleNumber === cycle)) {
        const list = bySeat.get(p.committeeMemberId) ?? [];
        list.push(p);
        bySeat.set(p.committeeMemberId, list);
      }
      for (const seatPayments of bySeat.values()) {
        const { paid } = cycleStatusFor(committee, cycle, seatPayments, now);
        collected += paid;
      }

      const isDrawn = cycle <= drawsRun;
      const isComplete = collected >= potMinor;

      events.push({
        id: `${committee.id}-due-${cycle}`,
        date: due.toISOString(),
        type: "PAYMENT_DUE",
        committeeId: committee.id,
        committeeName: committee.name,
        cycleNumber: cycle,
        title: `Cycle ${cycle} due`,
        detail: `${formatMoney(collected, committee.currency, committee.currencyExponent)} of ${formatMoney(potMinor, committee.currency, committee.currencyExponent)} collected`,
        status: isDrawn ? "DONE" : isComplete ? "READY" : due < now ? "OVERDUE" : "UPCOMING",
      });

      // The draw itself happens once grace has run out — drawing before then
      // would penalise anyone still inside their grace window.
      const drawDate = cycleGraceDeadline(committee, cycle);
      if (drawDate >= from && drawDate <= to) {
        events.push({
          id: `${committee.id}-draw-${cycle}`,
          date: drawDate.toISOString(),
          type: "DRAW",
          committeeId: committee.id,
          committeeName: committee.name,
          cycleNumber: cycle,
          title: `Cycle ${cycle} draw`,
          detail: formatMoney(potMinor, committee.currency, committee.currencyExponent),
          status: isDrawn ? "DONE" : isComplete ? "READY" : "BLOCKED",
        });
      }
    }
  }

  events.sort((a, b) => new Date(a.date) - new Date(b.date));
  return events;
}

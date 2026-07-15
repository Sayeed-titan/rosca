/**
 * Cycle scheduling.
 *
 * A committee runs exactly `totalSeats` cycles — one payout each, so every member
 * receives once. Cycle numbers are 1-based.
 *
 * All arithmetic is UTC. Committees are scheduled by calendar date, not by elapsed
 * milliseconds, so a local-timezone Date would shift due dates across a DST
 * boundary — a payment could become "late" because the clocks changed.
 */

/**
 * Due date for a given cycle.
 * @param {{startDate: Date, drawFrequency: "WEEKLY"|"MONTHLY", drawDay: number}} committee
 * @param {number} cycleNumber 1-based
 */
export function cycleDueDate(committee, cycleNumber) {
  const start = new Date(committee.startDate);
  const n = Math.max(1, cycleNumber) - 1;

  if (committee.drawFrequency === "WEEKLY") {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + n * 7);
    return d;
  }

  // MONTHLY: land on drawDay of the target month. Clamp to the last day so a
  // drawDay of 31 doesn't silently roll into March when the month is February.
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth() + n;
  const target = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const day = Math.min(committee.drawDay || 1, daysInMonth);

  return new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), day)
  );
}

/** Last day a cycle can be paid without a late fee. */
export function cycleGraceDeadline(committee, cycleNumber) {
  const due = cycleDueDate(committee, cycleNumber);
  const deadline = new Date(due);
  deadline.setUTCDate(deadline.getUTCDate() + (committee.gracePeriodDays ?? 0));
  return deadline;
}

/**
 * How many cycles have come due as of `now`, capped at the committee's length.
 * Returns 0 before the first due date.
 */
export function cyclesElapsed(committee, now = new Date()) {
  const total = committee.totalSeats;
  let count = 0;
  for (let n = 1; n <= total; n++) {
    if (cycleDueDate(committee, n) <= now) count = n;
    else break;
  }
  return count;
}

/** The cycle currently being collected — i.e. the next one not yet due, else the last. */
export function currentCycleNumber(committee, now = new Date()) {
  const elapsed = cyclesElapsed(committee, now);
  return Math.min(elapsed + 1, committee.totalSeats);
}

/** Next due date in the future, or null once the committee has run its course. */
export function nextDueDate(committee, now = new Date()) {
  for (let n = 1; n <= committee.totalSeats; n++) {
    const due = cycleDueDate(committee, n);
    if (due > now) return { cycleNumber: n, dueDate: due };
  }
  return null;
}

/** Was this payment late, given the grace period? */
export function isPaymentLate(committee, cycleNumber, paidAt) {
  return new Date(paidAt) > cycleGraceDeadline(committee, cycleNumber);
}

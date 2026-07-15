/**
 * Ledger arithmetic — the derivation of Paid / Due / Late / Advance.
 *
 * These statuses are COMPUTED from payment rows, never stored. A stored status is a
 * second source of truth, and the moment it disagrees with the payments it claims to
 * summarise, the app is lying about someone's money.
 *
 * Pure functions on plain data: no database, no dates beyond what's passed in. That
 * makes the money rules testable without a server, which is the point.
 */
import { applyBps, sumMinor } from "@/core/money";
import { cycleGraceDeadline, cycleDueDate } from "@/core/cycles";

export const CycleStatus = {
  /** Nothing owed yet — the cycle hasn't come due. */
  UPCOMING: "UPCOMING",
  /** Settled in full. */
  PAID: "PAID",
  /** Something arrived, but not the whole contribution. */
  PARTIAL: "PARTIAL",
  /** Due, nothing (or not enough) received, still inside the grace period. */
  DUE: "DUE",
  /** Past the grace deadline and still short. */
  LATE: "LATE",
  /** Paid more than owed. */
  ADVANCE: "ADVANCE",
};

/**
 * What a late payment costs, per the committee's rules.
 *
 * Returns minor units. Integer basis points, so a 2.5% fee is exact rather than
 * whatever 0.025 happens to be in binary floating point.
 */
export function calculateLateFee(committee, contributionMinor) {
  switch (committee.lateFeeType) {
    case "FLAT":
      return BigInt(committee.lateFeeFlatMinor ?? 0);
    case "PERCENT":
      return applyBps(contributionMinor, committee.lateFeePercentBps ?? 0);
    case "NONE":
    default:
      return 0n;
  }
}

/**
 * Is this payment late? Late means after the due date PLUS the grace period —
 * a grace period that didn't actually delay the penalty would be decorative.
 */
export function isLate(committee, cycleNumber, when) {
  return new Date(when) > cycleGraceDeadline(committee, cycleNumber);
}

/**
 * Net settled for one member in one cycle.
 *
 * Payments are signed, so a REVERSAL (negative) subtracts itself. No special-casing:
 * the sum is simply the truth.
 */
export function netPaidForCycle(payments) {
  return sumMinor(payments.map((p) => p.amountMinor));
}

/**
 * Derive one member's status for one cycle.
 *
 * @param {object} committee
 * @param {number} cycleNumber
 * @param {Array<{amountMinor: bigint|string}>} payments  payments for THIS cycle only
 * @param {Date} now
 */
export function cycleStatusFor(committee, cycleNumber, payments, now = new Date()) {
  const expected = BigInt(committee.contributionMinor);
  const paid = netPaidForCycle(payments);
  const due = cycleDueDate(committee, cycleNumber);
  const graceEnds = cycleGraceDeadline(committee, cycleNumber);

  /**
   * Two different questions, deliberately kept apart:
   *
   *   remaining   — how much of this cycle is still unpaid, whenever it's due.
   *                 This is what the DRAW cares about: the pot must be whole
   *                 before anyone takes it, and "not due yet" is no excuse.
   *
   *   outstanding — how much is in ARREARS, i.e. due and not paid. Future cycles
   *                 contribute nothing: a member who is perfectly up to date owes
   *                 nothing, even though later installments obviously remain.
   *
   * Conflating them made every member appear to owe the committee's entire
   * remaining life, and let the draw gate pass on a cycle nobody had paid yet.
   */
  const rawRemaining = expected - paid;
  const remaining = rawRemaining > 0n ? rawRemaining : 0n;
  const isDue = now >= due;
  const outstanding = isDue ? remaining : 0n;

  const base = { paid, expected, remaining, outstanding, overpaid: 0n };

  if (paid > expected) {
    return { ...base, status: CycleStatus.ADVANCE, overpaid: paid - expected };
  }
  if (paid === expected && expected > 0n) {
    return { ...base, status: CycleStatus.PAID };
  }

  if (!isDue) {
    return { ...base, status: paid > 0n ? CycleStatus.PARTIAL : CycleStatus.UPCOMING };
  }

  if (now > graceEnds) {
    return { ...base, status: CycleStatus.LATE };
  }

  return { ...base, status: paid > 0n ? CycleStatus.PARTIAL : CycleStatus.DUE };
}

/**
 * Whole-committee position for one member: every cycle, plus totals.
 * `payments` is that member's full history across all cycles.
 */
export function memberLedger(committee, payments, now = new Date()) {
  const byCycle = new Map();
  for (const p of payments) {
    const list = byCycle.get(p.cycleNumber) ?? [];
    list.push(p);
    byCycle.set(p.cycleNumber, list);
  }

  const cycles = [];
  for (let n = 1; n <= committee.totalSeats; n++) {
    cycles.push({
      cycleNumber: n,
      ...cycleStatusFor(committee, n, byCycle.get(n) ?? [], now),
      dueDate: cycleDueDate(committee, n),
    });
  }

  const totalPaid = sumMinor(cycles.map((c) => c.paid));
  /// Arrears only — what they owe today, not the committee's whole remaining life.
  const totalOutstanding = sumMinor(cycles.map((c) => c.outstanding));
  /// Everything still to pay across the committee, due or not.
  const totalRemaining = sumMinor(cycles.map((c) => c.remaining));

  const cyclesPaid = cycles.filter(
    (c) => c.status === CycleStatus.PAID || c.status === CycleStatus.ADVANCE
  ).length;

  return {
    cycles,
    totalPaid,
    totalOutstanding,
    totalRemaining,
    cyclesPaid,
    remainingInstallments: committee.totalSeats - cyclesPaid,
    isCurrent: cycles.every(
      (c) => c.status !== CycleStatus.LATE && c.status !== CycleStatus.DUE
    ),
  };
}

/**
 * Is a cycle fully collected across the whole roster?
 *
 * This is the draw's gate: nobody should take the pot while others still owe into
 * it. Returns who is short, so the UI can name them rather than just refusing.
 */
export function collectionStatusForCycle(
  committee,
  cycleNumber,
  seats,
  paymentsByMember,
  now = new Date()
) {
  const shortfalls = [];

  for (const seat of seats) {
    const payments = paymentsByMember.get(seat.id) ?? [];
    const forCycle = payments.filter((p) => p.cycleNumber === cycleNumber);
    const { status, remaining } = cycleStatusFor(committee, cycleNumber, forCycle, now);

    // `remaining`, not `outstanding`: the pot must be whole before anyone takes it.
    // Using arrears here would report a not-yet-due cycle that nobody has paid as
    // "fully collected", and hand out a pot that doesn't exist.
    if (remaining > 0n) {
      shortfalls.push({
        committeeMemberId: seat.id,
        memberName: seat.member?.fullName ?? "Unknown",
        outstanding: remaining,
        status,
      });
    }
  }

  return { complete: shortfalls.length === 0, shortfalls };
}

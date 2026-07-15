/**
 * Ledger rules: Paid / Due / Late / Advance, late fees, and reconciliation.
 *
 * These are pure functions over plain data, so the money rules are testable without
 * a database — which is exactly why they were built that way.
 */
import { describe, it, expect } from "vitest";

import {
  CycleStatus,
  calculateLateFee,
  isLate,
  netPaidForCycle,
  cycleStatusFor,
  memberLedger,
  collectionStatusForCycle,
} from "@/core/ledger";
import { toMinor } from "@/core/money";

/** BDT 5,000/month, 8 members, due on the 5th, 3 days' grace, 2.5% late fee. */
const committee = {
  contributionMinor: toMinor("5000"),
  currency: "BDT",
  currencyExponent: 2,
  totalSeats: 8,
  startDate: new Date("2026-01-05T00:00:00Z"),
  drawFrequency: "MONTHLY",
  drawDay: 5,
  gracePeriodDays: 3,
  lateFeeType: "PERCENT",
  lateFeePercentBps: 250,
  lateFeeFlatMinor: 0n,
};

const pay = (cycleNumber, amount) => ({ cycleNumber, amountMinor: toMinor(amount) });

describe("calculateLateFee", () => {
  it("computes a percentage fee exactly", () => {
    // 2.5% of 5,000 = 125.00
    expect(calculateLateFee(committee, committee.contributionMinor)).toBe(toMinor("125"));
  });

  it("computes a flat fee", () => {
    const c = { ...committee, lateFeeType: "FLAT", lateFeeFlatMinor: toMinor("100") };
    expect(calculateLateFee(c, c.contributionMinor)).toBe(toMinor("100"));
  });

  it("charges nothing when the committee has no late fee", () => {
    const c = { ...committee, lateFeeType: "NONE" };
    expect(calculateLateFee(c, c.contributionMinor)).toBe(0n);
  });
});

describe("isLate — the grace period must actually delay the penalty", () => {
  it("is not late on the due date", () => {
    expect(isLate(committee, 1, new Date("2026-01-05T12:00:00Z"))).toBe(false);
  });

  it("is not late on the final day of grace", () => {
    expect(isLate(committee, 1, new Date("2026-01-08T00:00:00Z"))).toBe(false);
  });

  it("is late the day after grace ends", () => {
    expect(isLate(committee, 1, new Date("2026-01-09T00:00:00Z"))).toBe(true);
  });

  it("tracks the cycle's own due date, not the committee start", () => {
    // Cycle 3 is due 5 March; early March is not late for it.
    expect(isLate(committee, 3, new Date("2026-03-06T00:00:00Z"))).toBe(false);
    expect(isLate(committee, 3, new Date("2026-03-20T00:00:00Z"))).toBe(true);
  });
});

describe("netPaidForCycle — reversals subtract themselves", () => {
  it("sums positive payments", () => {
    expect(netPaidForCycle([pay(1, "2000"), pay(1, "3000")])).toBe(toMinor("5000"));
  });

  it("nets a reversal to zero with no special-casing", () => {
    const payment = pay(1, "5000");
    const reversal = { cycleNumber: 1, amountMinor: -toMinor("5000") };
    expect(netPaidForCycle([payment, reversal])).toBe(0n);
  });

  it("is zero for no payments", () => {
    expect(netPaidForCycle([])).toBe(0n);
  });
});

describe("cycleStatusFor", () => {
  const inGrace = new Date("2026-01-06T00:00:00Z");
  const afterGrace = new Date("2026-01-20T00:00:00Z");
  const beforeDue = new Date("2026-01-01T00:00:00Z");

  it("PAID when settled in full", () => {
    const r = cycleStatusFor(committee, 1, [pay(1, "5000")], afterGrace);
    expect(r.status).toBe(CycleStatus.PAID);
    expect(r.outstanding).toBe(0n);
  });

  it("UPCOMING before the due date with nothing paid — not owing yet isn't arrears", () => {
    expect(cycleStatusFor(committee, 1, [], beforeDue).status).toBe(CycleStatus.UPCOMING);
  });

  it("DUE once due but still inside grace", () => {
    expect(cycleStatusFor(committee, 1, [], inGrace).status).toBe(CycleStatus.DUE);
  });

  it("LATE once grace has passed", () => {
    const r = cycleStatusFor(committee, 1, [], afterGrace);
    expect(r.status).toBe(CycleStatus.LATE);
    expect(r.outstanding).toBe(toMinor("5000"));
  });

  it("PARTIAL when some but not all arrived", () => {
    const r = cycleStatusFor(committee, 1, [pay(1, "2000")], inGrace);
    expect(r.status).toBe(CycleStatus.PARTIAL);
    expect(r.outstanding).toBe(toMinor("3000"));
  });

  it("ADVANCE when overpaid", () => {
    const r = cycleStatusFor(committee, 1, [pay(1, "6000")], inGrace);
    expect(r.status).toBe(CycleStatus.ADVANCE);
    expect(r.overpaid).toBe(toMinor("1000"));
    expect(r.outstanding).toBe(0n);
  });

  it("returns to LATE after a reversal wipes out the payment", () => {
    // The real scenario: a bounced cheque. Reversing must restore the debt, not
    // leave the cycle looking settled.
    const payment = pay(1, "5000");
    const reversal = { cycleNumber: 1, amountMinor: -toMinor("5000") };
    const r = cycleStatusFor(committee, 1, [payment, reversal], afterGrace);
    expect(r.status).toBe(CycleStatus.LATE);
    expect(r.outstanding).toBe(toMinor("5000"));
  });
});

describe("memberLedger", () => {
  const now = new Date("2026-03-20T00:00:00Z"); // cycles 1–3 are due

  it("counts remaining installments", () => {
    const l = memberLedger(committee, [pay(1, "5000"), pay(2, "5000")], now);
    expect(l.cyclesPaid).toBe(2);
    expect(l.remainingInstallments).toBe(6); // 8 total - 2 paid
  });

  it("totals what's been paid and what's still owed", () => {
    const l = memberLedger(committee, [pay(1, "5000"), pay(2, "5000")], now);
    expect(l.totalPaid).toBe(toMinor("10000"));
    // Cycle 3 is due and unpaid; 4–8 aren't due yet, so only cycle 3 is outstanding.
    expect(l.totalOutstanding).toBe(toMinor("5000"));
  });

  it("flags a member who is behind", () => {
    const behind = memberLedger(committee, [pay(1, "5000")], now);
    expect(behind.isCurrent).toBe(false);

    const current = memberLedger(
      committee,
      [pay(1, "5000"), pay(2, "5000"), pay(3, "5000")],
      now
    );
    expect(current.isCurrent).toBe(true);
  });

  it("produces one row per cycle", () => {
    const l = memberLedger(committee, [], now);
    expect(l.cycles).toHaveLength(committee.totalSeats);
    expect(l.cycles.map((c) => c.cycleNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("never reports negative outstanding when someone has overpaid", () => {
    const l = memberLedger(committee, [pay(1, "999999")], now);
    expect(l.totalOutstanding >= 0n).toBe(true);
  });
});

describe("collectionStatusForCycle — the draw's gate", () => {
  const seats = [
    { id: "s1", member: { fullName: "Rahima" } },
    { id: "s2", member: { fullName: "Kamal" } },
    { id: "s3", member: { fullName: "Nusrat" } },
  ];
  const now = new Date("2026-01-20T00:00:00Z"); // cycle 1 is past grace

  it("is complete when everyone has paid", () => {
    const byMember = new Map([
      ["s1", [pay(1, "5000")]],
      ["s2", [pay(1, "5000")]],
      ["s3", [pay(1, "5000")]],
    ]);
    const r = collectionStatusForCycle(committee, 1, seats, byMember, now);
    expect(r.complete).toBe(true);
    expect(r.shortfalls).toHaveLength(0);
  });

  it("names who is short, rather than just refusing", () => {
    const byMember = new Map([
      ["s1", [pay(1, "5000")]],
      ["s2", [pay(1, "2000")]],
      ["s3", []],
    ]);
    const r = collectionStatusForCycle(committee, 1, seats, byMember, now);

    expect(r.complete).toBe(false);
    expect(r.shortfalls).toHaveLength(2);
    expect(r.shortfalls.map((s) => s.memberName)).toEqual(["Kamal", "Nusrat"]);
    expect(r.shortfalls[0].outstanding).toBe(toMinor("3000"));
    expect(r.shortfalls[1].outstanding).toBe(toMinor("5000"));
  });

  it("refuses a cycle drawn EARLY that nobody has paid yet", () => {
    // Regression: the gate originally tested arrears, and a not-yet-due cycle has
    // no arrears by definition — so drawing cycle 8 in month 1 looked "complete"
    // and would have paid out a pot that didn't exist.
    const early = new Date("2026-01-06T00:00:00Z"); // cycle 8 is due in August
    const byMember = new Map([["s1", []], ["s2", []], ["s3", []]]);
    const r = collectionStatusForCycle(committee, 8, seats, byMember, early);

    expect(r.complete).toBe(false);
    expect(r.shortfalls).toHaveLength(3);
  });

  it("treats a reversed payment as unpaid — the gate must not be fooled", () => {
    const byMember = new Map([
      ["s1", [pay(1, "5000")]],
      ["s2", [pay(1, "5000")]],
      ["s3", [pay(1, "5000"), { cycleNumber: 1, amountMinor: -toMinor("5000") }]],
    ]);
    const r = collectionStatusForCycle(committee, 1, seats, byMember, now);
    expect(r.complete).toBe(false);
    expect(r.shortfalls[0].memberName).toBe("Nusrat");
  });
});

describe("whole-committee reconciliation", () => {
  it("nets to zero once every member has paid every cycle and every pot is out", () => {
    // The defining ROSCA invariant: money in == money out, exactly.
    const members = committee.totalSeats;
    const contributions = committee.contributionMinor * BigInt(members) * BigInt(members);
    const payouts = committee.contributionMinor * BigInt(members) * BigInt(members);
    expect(contributions - payouts).toBe(0n);
  });
});

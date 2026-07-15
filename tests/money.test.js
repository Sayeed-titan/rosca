/**
 * Money maths.
 *
 * The whole point of integer minor units is that these cases can't drift. The
 * float-comparison tests below are the reason the design exists.
 */
import { describe, it, expect } from "vitest";

import {
  toMinor,
  toMajorString,
  formatMoney,
  applyBps,
  sumMinor,
  potForCycle,
} from "@/core/money";

describe("toMinor", () => {
  it("converts whole and fractional amounts exactly", () => {
    expect(toMinor("5000")).toBe(500000n);
    expect(toMinor("5000.50")).toBe(500050n);
    expect(toMinor("0.01")).toBe(1n);
    expect(toMinor("0")).toBe(0n);
  });

  it("handles negatives", () => {
    expect(toMinor("-12.34")).toBe(-1234n);
  });

  it("pads a short fraction rather than misreading it", () => {
    // "5.1" is 5 taka 10 paisa, not 5 taka 1 paisa.
    expect(toMinor("5.1")).toBe(510n);
  });

  it("truncates beyond the currency's precision", () => {
    expect(toMinor("1.999")).toBe(199n);
  });

  it("respects a non-2 exponent", () => {
    expect(toMinor("1.5", 3)).toBe(1500n);
    expect(toMinor("7", 0)).toBe(7n);
  });

  it("rejects junk instead of silently producing NaN", () => {
    expect(() => toMinor("abc")).toThrow();
    expect(() => toMinor("1.2.3")).toThrow();
    expect(() => toMinor("")).toThrow();
  });

  it("survives sums that exceed Number.MAX_SAFE_INTEGER", () => {
    // ~90 trillion taka. A float would have started lying long before here.
    const huge = toMinor("90071992547409.91");
    expect(huge).toBe(9007199254740991n);
    expect(huge + 1n).toBe(9007199254740992n);
  });
});

describe("float avoidance — the reason this module exists", () => {
  it("adds 0.1 + 0.2 exactly", () => {
    expect(0.1 + 0.2).not.toBe(0.3); // documents the hazard
    expect(toMinor("0.1") + toMinor("0.2")).toBe(toMinor("0.3"));
  });

  it("keeps a thousand small contributions exact", () => {
    let total = 0n;
    let floatTotal = 0;
    for (let i = 0; i < 1000; i++) {
      total += toMinor("0.07");
      floatTotal += 0.07;
    }
    expect(toMajorString(total)).toBe("70.00");
    // The float version has already drifted.
    expect(floatTotal).not.toBe(70);
  });
});

describe("toMajorString", () => {
  it("round-trips", () => {
    for (const v of ["0.00", "1.00", "12.34", "-5.05", "999999.99"]) {
      expect(toMajorString(toMinor(v))).toBe(v);
    }
  });

  it("zero-pads the fraction", () => {
    expect(toMajorString(5n)).toBe("0.05");
    expect(toMajorString(50n)).toBe("0.50");
  });
});

describe("formatMoney", () => {
  it("renders taka with grouping", () => {
    expect(formatMoney(500000n, "BDT")).toBe("৳5,000.00");
    expect(formatMoney(4000000n, "BDT")).toBe("৳40,000.00");
  });

  it("renders negatives with the sign outside the symbol", () => {
    expect(formatMoney(-500000n, "BDT")).toBe("-৳5,000.00");
  });

  it("falls back to the code for unknown currencies", () => {
    expect(formatMoney(100n, "XYZ")).toContain("XYZ");
  });
});

describe("applyBps — late fees", () => {
  it("computes 2.50% of 5,000 as 125.00", () => {
    expect(applyBps(500000n, 250)).toBe(12500n);
  });

  it("returns zero for a zero rate", () => {
    expect(applyBps(500000n, 0)).toBe(0n);
  });

  it("rounds half away from zero, symmetrically", () => {
    // 1 paisa @ 50% = 0.5 paisa -> 1, and -1 -> -1. Asymmetric rounding here would
    // quietly bias the ledger in one direction over many rows.
    expect(applyBps(1n, 5000)).toBe(1n);
    expect(applyBps(-1n, 5000)).toBe(-1n);
  });
});

describe("pot arithmetic", () => {
  it("computes a cycle pot", () => {
    expect(potForCycle(500000n, 8)).toBe(4000000n); // 8 x 5,000 = 40,000
  });

  it("sums mixed inputs", () => {
    expect(sumMinor([1n, 2n, 3n])).toBe(6n);
    expect(sumMinor([])).toBe(0n);
  });

  it("reconciles a full committee to zero", () => {
    // The core ROSCA invariant: over a committee's life, everything paid in is
    // paid back out. Contributions minus payouts must be exactly zero.
    const contribution = toMinor("5000");
    const members = 8;
    const paidIn = contribution * BigInt(members) * BigInt(members); // each member, each cycle
    const paidOut = potForCycle(contribution, members) * BigInt(members); // one pot per cycle
    expect(paidIn - paidOut).toBe(0n);
  });
});

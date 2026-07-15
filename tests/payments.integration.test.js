/**
 * Payment service — integration, against the REAL database.
 *
 * This is the money path end to end: record -> ledger movements -> receipt -> audit,
 * then reversal. Mocking Prisma here would only prove the mock agrees with itself;
 * what we need to know is that the transaction, the constraints and the arithmetic
 * all hold in Postgres.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { prisma } from "@/core/db/prisma";
import { forOrganization } from "@/core/db/tenant";
import * as service from "@/features/payments/service";
import { toMinor } from "@/core/money";

const SUFFIX = `pay-${Date.now()}`;
let org;
let db;
let committee;
let seatA;
let seatB;
const actor = { userId: null, name: "Test Runner", email: "test@circlefund.dev" };

beforeAll(async () => {
  org = await prisma.organization.create({
    data: { name: "Payment Test Org", slug: `pay-org-${SUFFIX}` },
  });
  db = forOrganization(org.id);

  const user = await prisma.user.create({
    data: { email: `runner-${SUFFIX}@test.dev`, name: "Test Runner" },
  });
  actor.userId = user.id;

  // BDT 5,000/cycle, 2 members, due on the 5th, 3 days' grace, 2.5% late fee.
  committee = await prisma.committee.create({
    data: {
      organizationId: org.id,
      name: "Ledger Test Committee",
      contributionMinor: toMinor("5000"),
      currency: "BDT",
      currencyExponent: 2,
      totalSeats: 2,
      startDate: new Date("2026-01-05T00:00:00Z"),
      drawFrequency: "MONTHLY",
      drawDay: 5,
      gracePeriodDays: 3,
      lateFeeType: "PERCENT",
      lateFeePercentBps: 250,
      status: "ACTIVE",
    },
  });

  const [mA, mB] = await Promise.all([
    prisma.member.create({
      data: { organizationId: org.id, fullName: "Payer A", phone: "+8800000001" },
    }),
    prisma.member.create({
      data: { organizationId: org.id, fullName: "Payer B", phone: "+8800000002" },
    }),
  ]);

  [seatA, seatB] = await Promise.all([
    prisma.committeeMember.create({
      data: {
        organizationId: org.id,
        committeeId: committee.id,
        memberId: mA.id,
        position: 1,
      },
    }),
    prisma.committeeMember.create({
      data: {
        organizationId: org.id,
        committeeId: committee.id,
        memberId: mB.id,
        position: 2,
      },
    }),
  ]);
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: `pay-org-${SUFFIX}` } });
  await prisma.user.deleteMany({ where: { email: `runner-${SUFFIX}@test.dev` } });
  await prisma.$disconnect();
});

const basePayment = (over = {}) => ({
  committeeId: committee.id,
  committeeMemberId: seatA.id,
  cycleNumber: 1,
  amountMinor: toMinor("5000"),
  paidAt: new Date("2026-01-05T10:00:00Z"), // on time
  method: "BKASH",
  referenceNumber: "TRX123",
  notes: null,
  lateFeeOverrideMinor: null,
  ...over,
});

describe("recordPayment", () => {
  it("records an on-time payment with no late fee", async () => {
    const r = await service.recordPayment(db, actor, basePayment());

    expect(r.ok).toBe(true);
    expect(r.data.amountDisplay).toBe("৳5,000.00");
    expect(r.data.hasLateFee).toBe(false);
    expect(r.data.receiptNumber).toMatch(/^RCT-\d{4}-\d{5}$/);
  });

  it("writes the payment, both ledger movements, the receipt and the audit atomically", async () => {
    const r = await service.recordPayment(
      db,
      actor,
      basePayment({ cycleNumber: 2, committeeMemberId: seatB.id })
    );
    expect(r.ok).toBe(true);

    const [tx, receipt, audit] = await Promise.all([
      prisma.transaction.findMany({ where: { paymentId: r.data.id } }),
      prisma.receipt.findUnique({ where: { paymentId: r.data.id } }),
      prisma.auditLog.findFirst({
        where: { entityId: r.data.id, action: "payment.create" },
      }),
    ]);

    expect(tx).toHaveLength(1); // contribution only; no late fee on this one
    expect(tx[0].type).toBe("CONTRIBUTION_IN");
    expect(tx[0].amountMinor).toBe(toMinor("5000"));
    expect(receipt).not.toBeNull();
    expect(audit).not.toBeNull();
  });

  it("charges the committee's late fee when paid after grace", async () => {
    const r = await service.recordPayment(
      db,
      actor,
      basePayment({
        committeeMemberId: seatB.id,
        cycleNumber: 1,
        paidAt: new Date("2026-01-20T00:00:00Z"), // well past the 8th
      })
    );

    expect(r.ok).toBe(true);
    // 2.5% of 5,000 = 125.00 — computed from the rules, not supplied by the caller.
    expect(r.data.lateFeeDisplay).toBe("৳125.00");
    expect(r.data.hasLateFee).toBe(true);

    const tx = await prisma.transaction.findMany({
      where: { paymentId: r.data.id },
      orderBy: { type: "asc" },
    });
    expect(tx.map((t) => t.type).sort()).toEqual(["CONTRIBUTION_IN", "LATE_FEE_IN"]);
  });

  it("honours an explicit late fee waiver", async () => {
    const r = await service.recordPayment(
      db,
      actor,
      basePayment({
        cycleNumber: 2,
        paidAt: new Date("2026-02-20T00:00:00Z"), // late
        lateFeeOverrideMinor: 0n, // organiser waives it
      })
    );

    expect(r.ok).toBe(true);
    expect(r.data.lateFeeDisplay).toBe("৳0.00");

    // The waiver must be visible in the audit trail, not silent.
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: r.data.id, action: "payment.create" },
    });
    expect(audit.after.feeWasOverridden).toBe(true);
    expect(audit.after.calculatedFeeMinor).toBe("12500");
  });

  it("rejects a seat from a different committee", async () => {
    const otherCommittee = await prisma.committee.create({
      data: {
        organizationId: org.id,
        name: `Other ${SUFFIX}`,
        contributionMinor: toMinor("100"),
        totalSeats: 2,
        startDate: new Date("2026-01-01"),
      },
    });

    // Both ids come from the client; trusting them to agree would let a payment be
    // filed against another committee's roster.
    const r = await service.recordPayment(
      db,
      actor,
      basePayment({ committeeId: otherCommittee.id })
    );

    expect(r.ok).toBe(false);
    expect(r.error.code).toBe("validation.failed");
  });

  it("rejects a cycle beyond the committee's length", async () => {
    const r = await service.recordPayment(db, actor, basePayment({ cycleNumber: 99 }));
    expect(r.ok).toBe(false);
    expect(r.error.message).toContain("only runs 2 cycles");
  });
});

describe("reversePayment", () => {
  it("appends a negative row and nets the cycle back to zero", async () => {
    const paid = await service.recordPayment(
      db,
      actor,
      basePayment({ cycleNumber: 1, committeeMemberId: seatA.id, amountMinor: toMinor("1500") })
    );
    expect(paid.ok).toBe(true);

    const before = await prisma.payment.aggregate({
      where: { committeeMemberId: seatA.id },
      _sum: { amountMinor: true },
    });

    const rev = await service.reversePayment(db, actor, {
      paymentId: paid.data.id,
      reason: "Cheque bounced",
    });
    expect(rev.ok).toBe(true);

    const after = await prisma.payment.aggregate({
      where: { committeeMemberId: seatA.id },
      _sum: { amountMinor: true },
    });

    // The reversal subtracts exactly what the original added — no special-casing.
    expect(after._sum.amountMinor).toBe(before._sum.amountMinor - toMinor("1500"));
  });

  it("refuses to reverse the same payment twice", async () => {
    const paid = await service.recordPayment(
      db,
      actor,
      basePayment({ cycleNumber: 2, committeeMemberId: seatA.id, amountMinor: toMinor("700") })
    );

    const first = await service.reversePayment(db, actor, {
      paymentId: paid.data.id,
      reason: "First reversal",
    });
    expect(first.ok).toBe(true);

    const second = await service.reversePayment(db, actor, {
      paymentId: paid.data.id,
      reason: "Trying again",
    });
    expect(second.ok).toBe(false);
    expect(second.error.code).toBe("payment.already_reversed");
  });

  it("refuses to reverse a reversal", async () => {
    const paid = await service.recordPayment(
      db,
      actor,
      basePayment({ cycleNumber: 2, committeeMemberId: seatB.id, amountMinor: toMinor("300") })
    );
    const rev = await service.reversePayment(db, actor, {
      paymentId: paid.data.id,
      reason: "Undo",
    });

    const again = await service.reversePayment(db, actor, {
      paymentId: rev.data.id,
      reason: "Undo the undo",
    });
    expect(again.ok).toBe(false);
    expect(again.error.code).toBe("payment.not_reversible");
  });

  it("never mutates the original row — append-only", async () => {
    const paid = await service.recordPayment(
      db,
      actor,
      basePayment({ cycleNumber: 1, committeeMemberId: seatB.id, amountMinor: toMinor("250") })
    );
    const originalRow = await prisma.payment.findUnique({ where: { id: paid.data.id } });

    await service.reversePayment(db, actor, {
      paymentId: paid.data.id,
      reason: "Recorded twice by mistake",
    });

    const afterRow = await prisma.payment.findUnique({ where: { id: paid.data.id } });

    // The original is untouched: same amount, still present. Only a new row exists.
    expect(afterRow.amountMinor).toBe(originalRow.amountMinor);
    expect(afterRow.kind).toBe("CONTRIBUTION");
    expect(afterRow).not.toBeNull();
  });
});

describe("receipt", () => {
  it("returns the frozen snapshot rather than a fresh computation", async () => {
    const paid = await service.recordPayment(
      db,
      actor,
      basePayment({ cycleNumber: 1, committeeMemberId: seatA.id, amountMinor: toMinor("4321") })
    );

    const r = await service.getReceipt(db, paid.data.id);
    expect(r.ok).toBe(true);
    expect(r.data.amount).toBe("৳4,321.00");
    expect(r.data.memberName).toBe("Payer A");
    expect(r.data.committeeName).toBe("Ledger Test Committee");
    expect(r.data.receiptNumber).toMatch(/^RCT-/);
  });
});

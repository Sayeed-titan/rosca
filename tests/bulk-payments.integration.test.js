/**
 * Bulk payment entry — against the REAL database.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { prisma } from "@/core/db/prisma";
import { forOrganization } from "@/core/db/tenant";
import * as seats from "@/features/committees/seats/service";
import * as service from "@/features/payments/service";
import { toMinor } from "@/core/money";

const SUFFIX = `bulk-${Date.now()}`;
let org;
let db;
let actor;

beforeAll(async () => {
  org = await prisma.organization.create({
    data: { name: "Bulk Test Org", slug: `bulk-org-${SUFFIX}` },
  });
  db = forOrganization(org.id);
  const user = await prisma.user.create({
    data: { email: `bulkrunner-${SUFFIX}@test.dev`, name: "Bulk Runner" },
  });
  actor = { userId: user.id, name: "Owner", organizationId: org.id, role: "ORG_OWNER" };
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: `bulk-org-${SUFFIX}` } });
  await prisma.user.deleteMany({ where: { email: `bulkrunner-${SUFFIX}@test.dev` } });
  await prisma.$disconnect();
});

async function makeCommitteeWithSeats(name, seatCount) {
  const committee = await prisma.committee.create({
    data: {
      organizationId: org.id,
      name: `${name} ${SUFFIX}`,
      contributionMinor: toMinor("1000"),
      currency: "BDT",
      currencyExponent: 2,
      totalSeats: seatCount,
      startDate: new Date("2026-01-05T00:00:00Z"),
      status: "ACTIVE",
    },
  });
  const seatRows = [];
  for (let i = 0; i < seatCount; i++) {
    const m = await prisma.member.create({
      data: {
        organizationId: org.id,
        fullName: `Bulk Member ${i} ${SUFFIX}`,
        phone: `+8806${Date.now()}${i}`.slice(0, 15),
      },
    });
    const r = await seats.assignSeats(db, actor, { committeeId: committee.id, memberId: m.id, seatCount: 1 });
    seatRows.push(r.data.seats[0]);
  }
  return { committee, seatRows };
}

describe("recordBulkPayments", () => {
  it("records one payment per seat in a single batch", async () => {
    const { committee, seatRows } = await makeCommitteeWithSeats("Batch", 3);

    const r = await service.recordBulkPayments(db, actor, {
      committeeId: committee.id,
      paidAt: new Date("2026-01-05T09:00:00Z"),
      method: "CASH",
      entries: seatRows.map((s) => ({
        committeeMemberId: s.id,
        startCycle: 1,
        cycleCount: 1,
        amountPerCycleMinor: toMinor("1000"),
        referenceNumber: null,
      })),
    });

    expect(r.ok).toBe(true);
    expect(r.data.count).toBe(3);

    const paymentCount = await prisma.payment.count({ where: { committeeId: committee.id } });
    expect(paymentCount).toBe(3);
  });

  it("records several cycles for one seat in a single entry — the multi-month case", async () => {
    const { committee, seatRows } = await makeCommitteeWithSeats("MultiMonth", 4);

    const r = await service.recordBulkPayments(db, actor, {
      committeeId: committee.id,
      paidAt: new Date("2026-01-05T09:00:00Z"),
      method: "BKASH",
      entries: [
        {
          committeeMemberId: seatRows[0].id,
          startCycle: 1,
          cycleCount: 3, // pays cycles 1, 2 and 3 in one go
          amountPerCycleMinor: toMinor("1000"),
          referenceNumber: "01700000000",
        },
      ],
    });

    expect(r.ok).toBe(true);
    expect(r.data.count).toBe(3);

    const cycles = await prisma.payment.findMany({
      where: { committeeMemberId: seatRows[0].id },
      select: { cycleNumber: true },
      orderBy: { cycleNumber: "asc" },
    });
    expect(cycles.map((c) => c.cycleNumber)).toEqual([1, 2, 3]);
  });

  it("assigns distinct sequential receipt numbers within one batch — no collisions", async () => {
    const { committee, seatRows } = await makeCommitteeWithSeats("Receipts", 5);

    await service.recordBulkPayments(db, actor, {
      committeeId: committee.id,
      paidAt: new Date("2026-01-05T09:00:00Z"),
      method: "CASH",
      entries: seatRows.map((s) => ({
        committeeMemberId: s.id,
        startCycle: 1,
        cycleCount: 1,
        amountPerCycleMinor: toMinor("1000"),
        referenceNumber: null,
      })),
    });

    const receipts = await prisma.receipt.findMany({
      where: { payment: { committeeId: committee.id } },
      select: { receiptNumber: true },
    });
    expect(receipts).toHaveLength(5);
    expect(new Set(receipts.map((r) => r.receiptNumber)).size).toBe(5);
  });

  it("rolls back the WHOLE batch if one entry is invalid — atomic, not partial", async () => {
    const { committee, seatRows } = await makeCommitteeWithSeats("Atomic", 3);

    const r = await service.recordBulkPayments(db, actor, {
      committeeId: committee.id,
      paidAt: new Date("2026-01-05T09:00:00Z"),
      method: "CASH",
      entries: [
        {
          committeeMemberId: seatRows[0].id,
          startCycle: 1,
          cycleCount: 1,
          amountPerCycleMinor: toMinor("1000"),
          referenceNumber: null,
        },
        {
          committeeMemberId: "not-a-real-seat-id",
          startCycle: 1,
          cycleCount: 1,
          amountPerCycleMinor: toMinor("1000"),
          referenceNumber: null,
        },
      ],
    });

    expect(r.ok).toBe(false);

    // Nothing from the batch should have landed — including the valid first entry.
    const count = await prisma.payment.count({ where: { committeeId: committee.id } });
    expect(count).toBe(0);
  });

  it("rejects an entry reaching past the committee's cycle count", async () => {
    const { committee, seatRows } = await makeCommitteeWithSeats("TooFar", 2);

    const r = await service.recordBulkPayments(db, actor, {
      committeeId: committee.id,
      paidAt: new Date("2026-01-05T09:00:00Z"),
      method: "CASH",
      entries: [
        {
          committeeMemberId: seatRows[0].id,
          startCycle: 1,
          cycleCount: 5, // this committee only has 2 cycles
          amountPerCycleMinor: toMinor("1000"),
          referenceNumber: null,
        },
      ],
    });

    expect(r.ok).toBe(false);
    expect(r.error.message).toContain("only runs 2 cycle");
  });

  it("charges a late fee on the appropriate cycle within a multi-cycle batch", async () => {
    const committee = await prisma.committee.create({
      data: {
        organizationId: org.id,
        name: `LateBatch ${SUFFIX}`,
        contributionMinor: toMinor("1000"),
        currency: "BDT",
        currencyExponent: 2,
        totalSeats: 2,
        startDate: new Date("2026-01-05T00:00:00Z"),
        drawDay: 5,
        gracePeriodDays: 3,
        lateFeeType: "FLAT",
        lateFeeFlatMinor: toMinor("50"),
        status: "ACTIVE",
      },
    });
    const m = await prisma.member.create({
      data: { organizationId: org.id, fullName: `Late Batch Member ${SUFFIX}`, phone: "+8806999999" },
    });
    const seat = await seats.assignSeats(db, actor, { committeeId: committee.id, memberId: m.id, seatCount: 1 });

    // Paid on the 20th — cycle 1 (due 5th, grace to 8th) is late; cycle 2 (due next
    // month) is not.
    const r = await service.recordBulkPayments(db, actor, {
      committeeId: committee.id,
      paidAt: new Date("2026-01-20T00:00:00Z"),
      method: "CASH",
      entries: [
        {
          committeeMemberId: seat.data.seats[0].id,
          startCycle: 1,
          cycleCount: 2,
          amountPerCycleMinor: toMinor("1000"),
          referenceNumber: null,
        },
      ],
    });

    expect(r.ok).toBe(true);

    const rows = await prisma.payment.findMany({
      where: { committeeMemberId: seat.data.seats[0].id },
      orderBy: { cycleNumber: "asc" },
      select: { cycleNumber: true, lateFeeMinor: true },
    });
    expect(rows[0].lateFeeMinor).toBe(toMinor("50")); // cycle 1: late
    expect(rows[1].lateFeeMinor).toBe(0n); // cycle 2: not due yet, not late
  });
});

/**
 * Seat assignment — integration, against the REAL database.
 *
 * The feature under test: a member may hold SEVERAL seats in one committee. They
 * pay the contribution once per seat each cycle and are eligible for the pot once
 * per seat, so a 2-seat member in a 4-seat committee wins two of the four cycles.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { prisma } from "@/core/db/prisma";
import { forOrganization } from "@/core/db/tenant";
import * as seats from "@/features/committees/seats/service";
import * as draws from "@/features/draws/service";
import * as payments from "@/features/payments/service";
import { toMinor } from "@/core/money";

const SUFFIX = `seat-${Date.now()}`;
let org;
let db;
let actor;
let rahima;
let kamal;

beforeAll(async () => {
  org = await prisma.organization.create({
    data: { name: "Seat Test Org", slug: `seat-org-${SUFFIX}` },
  });
  db = forOrganization(org.id);

  const user = await prisma.user.create({
    data: { email: `seats-${SUFFIX}@test.dev`, name: "Seat Runner" },
  });
  actor = {
    userId: user.id,
    name: "Owner",
    isSuperAdmin: false,
    organizationId: org.id,
    role: "ORG_OWNER",
  };

  [rahima, kamal] = await Promise.all([
    prisma.member.create({
      data: { organizationId: org.id, fullName: "Rahima Two-Share", phone: "+8809000001" },
    }),
    prisma.member.create({
      data: { organizationId: org.id, fullName: "Kamal One-Share", phone: "+8809000002" },
    }),
  ]);
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: `seat-org-${SUFFIX}` } });
  await prisma.user.deleteMany({ where: { email: `seats-${SUFFIX}@test.dev` } });
  await prisma.$disconnect();
});

async function makeCommittee(name, totalSeats) {
  return prisma.committee.create({
    data: {
      organizationId: org.id,
      name: `${name} ${SUFFIX}`,
      contributionMinor: toMinor("1000"),
      currency: "BDT",
      currencyExponent: 2,
      totalSeats,
      startDate: new Date("2026-01-05T00:00:00Z"),
      drawFrequency: "MONTHLY",
      drawDay: 5,
      gracePeriodDays: 3,
      lateFeeType: "NONE",
      status: "ACTIVE",
    },
  });
}

describe("multiple seats per member", () => {
  it("lets one member take several seats", async () => {
    const c = await makeCommittee("MultiSeat", 4);

    const r = await seats.assignSeats(db, actor, {
      committeeId: c.id,
      memberId: rahima.id,
      seatCount: 3,
    });

    expect(r.ok).toBe(true);
    expect(r.data.seats).toHaveLength(3);
    // Lowest free positions, in order.
    expect(r.data.seats.map((s) => s.position).sort()).toEqual([1, 2, 3]);
  });

  it("reports seats and unique people separately", async () => {
    const c = await makeCommittee("Counts", 4);
    await seats.assignSeats(db, actor, { committeeId: c.id, memberId: rahima.id, seatCount: 3 });
    await seats.assignSeats(db, actor, { committeeId: c.id, memberId: kamal.id, seatCount: 1 });

    const r = await seats.listSeats(db, c.id);

    expect(r.ok).toBe(true);
    expect(r.data.seatsTaken).toBe(4);
    // 4 seats, 2 people — the distinction the whole feature rests on.
    expect(r.data.uniqueMembers).toBe(2);
    expect(r.data.seatsOpen).toBe(0);
    expect(r.data.seats.filter((s) => s.memberId === rahima.id)).toHaveLength(3);
    expect(r.data.seats.every((s) => s.memberId !== rahima.id || s.seatsHeldByMember === 3)).toBe(true);
  });

  it("refuses to oversubscribe the committee", async () => {
    const c = await makeCommittee("Oversub", 3);

    const r = await seats.assignSeats(db, actor, {
      committeeId: c.id,
      memberId: rahima.id,
      seatCount: 5,
    });

    expect(r.ok).toBe(false);
    expect(r.error.message).toContain("Only 3 seats left");
  });

  it("refuses once the committee is full", async () => {
    const c = await makeCommittee("Full", 2);
    await seats.assignSeats(db, actor, { committeeId: c.id, memberId: rahima.id, seatCount: 2 });

    const r = await seats.assignSeats(db, actor, {
      committeeId: c.id,
      memberId: kamal.id,
      seatCount: 1,
    });

    expect(r.ok).toBe(false);
    expect(r.error.message).toContain("is full");
  });

  it("charges a multi-seat member once per seat", async () => {
    const c = await makeCommittee("Charged", 3);
    await seats.assignSeats(db, actor, { committeeId: c.id, memberId: rahima.id, seatCount: 2 });
    await seats.assignSeats(db, actor, { committeeId: c.id, memberId: kamal.id, seatCount: 1 });

    const roster = await seats.listSeats(db, c.id);
    const rahimaSeats = roster.data.seats.filter((s) => s.memberId === rahima.id);

    // Pay only ONE of Rahima's two seats.
    await payments.recordPayment(db, actor, {
      committeeId: c.id,
      committeeMemberId: rahimaSeats[0].id,
      cycleNumber: 1,
      amountMinor: toMinor("1000"),
      paidAt: new Date("2026-01-05T09:00:00Z"),
      method: "CASH",
      referenceNumber: null,
      notes: null,
      lateFeeOverrideMinor: null,
    });

    const after = await seats.listSeats(db, c.id, new Date("2026-01-20T00:00:00Z"));
    const paid = after.data.seats.find((s) => s.id === rahimaSeats[0].id);
    const unpaid = after.data.seats.find((s) => s.id === rahimaSeats[1].id);

    // Her other seat still owes — holding two shares means paying twice.
    expect(paid.hasArrears).toBe(false);
    expect(unpaid.hasArrears).toBe(true);
  });

  it("lets a two-seat member win twice, in different cycles", async () => {
    const c = await makeCommittee("WinTwice", 2);
    // Rahima holds BOTH seats, so she must win both cycles.
    await seats.assignSeats(db, actor, { committeeId: c.id, memberId: rahima.id, seatCount: 2 });

    const roster = await seats.listSeats(db, c.id);

    for (let cycle = 1; cycle <= 2; cycle++) {
      for (const seat of roster.data.seats) {
        await payments.recordPayment(db, actor, {
          committeeId: c.id,
          committeeMemberId: seat.id,
          cycleNumber: cycle,
          amountMinor: toMinor("1000"),
          paidAt: new Date("2026-01-05T09:00:00Z"),
          method: "CASH",
          referenceNumber: null,
          notes: null,
          lateFeeOverrideMinor: null,
        });
      }

      const r = await draws.runDraw(db, actor, { committeeId: c.id });
      expect(r.ok).toBe(true);
      // Both wins go to the same person — impossible before this change.
      expect(r.data.winnerName).toBe("Rahima Two-Share");
    }

    // Two draws, two distinct SEATS, one member.
    const drawRows = await prisma.draw.findMany({ where: { committeeId: c.id } });
    expect(drawRows).toHaveLength(2);
    expect(new Set(drawRows.map((d) => d.winnerCommitteeMemberId)).size).toBe(2);
  });
});

describe("roster protection", () => {
  it("locks the roster once draws have started", async () => {
    const c = await makeCommittee("Locked", 3);
    await seats.assignSeats(db, actor, { committeeId: c.id, memberId: rahima.id, seatCount: 2 });
    await seats.assignSeats(db, actor, { committeeId: c.id, memberId: kamal.id, seatCount: 1 });

    const roster = await seats.listSeats(db, c.id);
    for (const seat of roster.data.seats) {
      await payments.recordPayment(db, actor, {
        committeeId: c.id,
        committeeMemberId: seat.id,
        cycleNumber: 1,
        amountMinor: toMinor("1000"),
        paidAt: new Date("2026-01-05T09:00:00Z"),
        method: "CASH",
        referenceNumber: null,
        notes: null,
        lateFeeOverrideMinor: null,
      });
    }
    await draws.runDraw(db, actor, { committeeId: c.id });

    // Now try to grow the committee mid-flight.
    await prisma.committee.update({ where: { id: c.id }, data: { totalSeats: 4 } });
    const r = await seats.assignSeats(db, actor, {
      committeeId: c.id,
      memberId: kamal.id,
      seatCount: 1,
    });

    // Adding a seat after a draw would change the pot everyone already paid into
    // and dilute the odds of members already drawn against.
    expect(r.ok).toBe(false);
    expect(r.error.message).toContain("Draws have already started");
  });

  it("refuses to remove a seat that has payments against it", async () => {
    const c = await makeCommittee("HasPaid", 3);
    await seats.assignSeats(db, actor, { committeeId: c.id, memberId: kamal.id, seatCount: 1 });
    const roster = await seats.listSeats(db, c.id);
    const seat = roster.data.seats[0];

    await payments.recordPayment(db, actor, {
      committeeId: c.id,
      committeeMemberId: seat.id,
      cycleNumber: 1,
      amountMinor: toMinor("1000"),
      paidAt: new Date("2026-01-05T09:00:00Z"),
      method: "CASH",
      referenceNumber: null,
      notes: null,
      lateFeeOverrideMinor: null,
    });

    const r = await seats.removeSeat(db, actor, { seatId: seat.id });

    expect(r.ok).toBe(false);
    expect(r.error.message).toContain("payment");
  });

  it("removes a clean seat", async () => {
    const c = await makeCommittee("CleanRemove", 3);
    await seats.assignSeats(db, actor, { committeeId: c.id, memberId: kamal.id, seatCount: 1 });
    const roster = await seats.listSeats(db, c.id);

    const r = await seats.removeSeat(db, actor, { seatId: roster.data.seats[0].id });
    expect(r.ok).toBe(true);

    const after = await seats.listSeats(db, c.id);
    expect(after.data.seatsTaken).toBe(0);
  });
});

describe("the roster view answers the spec's questions", () => {
  it("reports Received Pot?, Payment Status and Remaining Installments per seat", async () => {
    const c = await makeCommittee("SpecView", 2);
    await seats.assignSeats(db, actor, { committeeId: c.id, memberId: rahima.id, seatCount: 1 });
    await seats.assignSeats(db, actor, { committeeId: c.id, memberId: kamal.id, seatCount: 1 });

    const roster = await seats.listSeats(db, c.id);
    for (const seat of roster.data.seats) {
      await payments.recordPayment(db, actor, {
        committeeId: c.id,
        committeeMemberId: seat.id,
        cycleNumber: 1,
        amountMinor: toMinor("1000"),
        paidAt: new Date("2026-01-05T09:00:00Z"),
        method: "CASH",
        referenceNumber: null,
        notes: null,
        lateFeeOverrideMinor: null,
      });
    }
    const drawn = await draws.runDraw(db, actor, { committeeId: c.id });

    const after = await seats.listSeats(db, c.id);
    const winner = after.data.seats.find((s) => s.id === drawn.data.winnerId);
    const loser = after.data.seats.find((s) => s.id !== drawn.data.winnerId);

    // "Received Pot?" — derived from Draw, never stored.
    expect(winner.hasReceived).toBe(true);
    expect(winner.receivedInCycle).toBe(1);
    expect(loser.hasReceived).toBe(false);

    // Payment status + remaining installments.
    expect(winner.paidDisplay).toBe("৳1,000.00");
    expect(winner.remainingInstallments).toBe(1); // 2 cycles, 1 paid
    expect(winner.cyclesPaid).toBe(1);
  });
});

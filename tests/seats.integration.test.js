/**
 * Seat assignment — integration, against the REAL database.
 *
 * Two things are under test:
 *
 *  1. A member may hold SEVERAL seats in one committee. They pay the contribution
 *     once per seat each cycle and are eligible for the pot once per seat, so a
 *     2-seat member in a 4-seat committee wins two of the four cycles.
 *
 *  2. The roster is FLEXIBLE, not capped. `committee.totalSeats` is not a target
 *     declared upfront — it is kept in sync with however many seats actually exist
 *     (assignSeats/removeSeat update it directly) and only freezes once the first
 *     draw runs, because the pot and cycle count for that draw were computed from
 *     whatever the roster was at that moment.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { prisma } from "@/core/db/prisma";
import { forOrganization } from "@/core/db/tenant";
import * as seats from "@/features/committees/seats/service";
import * as committees from "@/features/committees/service";
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

/** `plannedSeats` is deliberately just a starting number — see the describe block below. */
async function makeCommittee(name, plannedSeats) {
  return prisma.committee.create({
    data: {
      organizationId: org.id,
      name: `${name} ${SUFFIX}`,
      contributionMinor: toMinor("1000"),
      currency: "BDT",
      currencyExponent: 2,
      totalSeats: plannedSeats,
      startDate: new Date("2026-01-05T00:00:00Z"),
      drawFrequency: "MONTHLY",
      drawDay: 5,
      gracePeriodDays: 3,
      lateFeeType: "NONE",
      status: "ACTIVE",
    },
  });
}

async function payCycle(committeeId, seatRows, cycleNumber) {
  for (const seat of seatRows) {
    await payments.recordPayment(db, actor, {
      committeeId,
      committeeMemberId: seat.id,
      cycleNumber,
      amountMinor: toMinor("1000"),
      paidAt: new Date("2026-01-05T09:00:00Z"),
      method: "CASH",
      referenceNumber: null,
      notes: null,
      lateFeeOverrideMinor: null,
    });
  }
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
    expect(r.data.seats.filter((s) => s.memberId === rahima.id)).toHaveLength(3);
    expect(r.data.seats.every((s) => s.memberId !== rahima.id || s.seatsHeldByMember === 3)).toBe(true);
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
      await payCycle(c.id, roster.data.seats, cycle);
      const r = await draws.runDraw(db, actor, { committeeId: c.id });
      expect(r.ok).toBe(true);
      // Both wins go to the same person — impossible before multi-seat support.
      expect(r.data.winnerName).toBe("Rahima Two-Share");
    }

    // Two draws, two distinct SEATS, one member.
    const drawRows = await prisma.draw.findMany({ where: { committeeId: c.id } });
    expect(drawRows).toHaveLength(2);
    expect(new Set(drawRows.map((d) => d.winnerCommitteeMemberId)).size).toBe(2);
  });
});

/**
 * These replace the old "refuses to oversubscribe" / "refuses once full" tests.
 * That behavior was the bug the user reported: a committee "planned" for N seats
 * hard-refused a member beyond N, even with zero draws run. The fix removes the
 * cap and keeps totalSeats truthful to the live roster instead.
 */
describe("seat count is flexible until the first draw — no cap", () => {
  it("accepts assigning MORE seats than the committee was created with", async () => {
    const c = await makeCommittee("Grows", 3); // "planned" for 3

    const first = await seats.assignSeats(db, actor, {
      committeeId: c.id,
      memberId: rahima.id,
      seatCount: 3,
    });
    expect(first.ok).toBe(true);

    // A 4th seat, beyond the original plan — must succeed, not "Only 0 left".
    const second = await seats.assignSeats(db, actor, {
      committeeId: c.id,
      memberId: kamal.id,
      seatCount: 1,
    });
    expect(second.ok).toBe(true);

    const stored = await prisma.committee.findUnique({ where: { id: c.id } });
    expect(stored.totalSeats).toBe(4);
  });

  it("shrinks totalSeats when a seat is removed pre-draw", async () => {
    const c = await makeCommittee("Shrinks", 2);

    const created = await seats.assignSeats(db, actor, {
      committeeId: c.id,
      memberId: rahima.id,
      seatCount: 3,
    });
    expect((await prisma.committee.findUnique({ where: { id: c.id } })).totalSeats).toBe(3);

    const removed = await seats.removeSeat(db, actor, { seatId: created.data.seats[0].id });
    expect(removed.ok).toBe(true);
    expect((await prisma.committee.findUnique({ where: { id: c.id } })).totalSeats).toBe(2);
  });

  it("keeps totalSeats always equal to the live seat count pre-draw", async () => {
    const c = await makeCommittee("AlwaysSynced", 10);

    await seats.assignSeats(db, actor, { committeeId: c.id, memberId: rahima.id, seatCount: 1 });
    await seats.assignSeats(db, actor, { committeeId: c.id, memberId: kamal.id, seatCount: 2 });

    const live = await prisma.committeeMember.count({
      where: { committeeId: c.id, deletedAt: null },
    });
    const stored = await prisma.committee.findUnique({ where: { id: c.id } });

    expect(stored.totalSeats).toBe(live);
    expect(stored.totalSeats).toBe(3); // not 10 — the "plan" was never a cap
  });

  it("lets seats keep growing across several separate assignments", async () => {
    const c = await makeCommittee("Repeated", 1);
    for (let i = 0; i < 5; i++) {
      const m = await prisma.member.create({
        data: { organizationId: org.id, fullName: `Grower ${i} ${SUFFIX}`, phone: `+88070000${i}` },
      });
      const r = await seats.assignSeats(db, actor, {
        committeeId: c.id,
        memberId: m.id,
        seatCount: 1,
      });
      expect(r.ok).toBe(true);
    }
    expect((await prisma.committee.findUnique({ where: { id: c.id } })).totalSeats).toBe(5);
  });
});

describe("roster protection — freezes only once a draw has run", () => {
  it("refuses to add a seat after the first draw", async () => {
    const c = await makeCommittee("LockedAdd", 3);
    await seats.assignSeats(db, actor, { committeeId: c.id, memberId: rahima.id, seatCount: 2 });
    await seats.assignSeats(db, actor, { committeeId: c.id, memberId: kamal.id, seatCount: 1 });

    const roster = await seats.listSeats(db, c.id);
    await payCycle(c.id, roster.data.seats, 1);
    await draws.runDraw(db, actor, { committeeId: c.id });

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

  it("refuses to remove ANY seat once a draw has run — even one that never paid or won", async () => {
    // This is the case the OLD rule missed: it only checked whether the seat being
    // removed itself had payments/a win. A totally untouched 3rd seat could be
    // silently removed after cycle 1's pot and schedule were already fixed.
    const c = await makeCommittee("LockedRemoveUntouched", 3);
    const m1 = await prisma.member.create({
      data: { organizationId: org.id, fullName: `R1 ${SUFFIX}`, phone: "+8807100001" },
    });
    const m2 = await prisma.member.create({
      data: { organizationId: org.id, fullName: `R2 ${SUFFIX}`, phone: "+8807100002" },
    });
    const m3 = await prisma.member.create({
      data: { organizationId: org.id, fullName: `R3 ${SUFFIX}`, phone: "+8807100003" },
    });
    for (const m of [m1, m2, m3]) {
      await seats.assignSeats(db, actor, { committeeId: c.id, memberId: m.id, seatCount: 1 });
    }

    const roster = await seats.listSeats(db, c.id);
    await payCycle(c.id, roster.data.seats, 1);
    await draws.runDraw(db, actor, { committeeId: c.id });

    const untouchedSeat = roster.data.seats.find((s) => s.memberId === m3.id);
    const attempt = await seats.removeSeat(db, actor, { seatId: untouchedSeat.id });

    expect(attempt.ok).toBe(false);
    expect(attempt.error.message).toContain("frozen for every seat");

    const stored = await prisma.committee.findUnique({ where: { id: c.id } });
    expect(stored.totalSeats).toBe(3); // unchanged
  });

  it("refuses to remove a seat that has payments against it, even pre-draw", async () => {
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

  it("removes a clean seat pre-draw", async () => {
    const c = await makeCommittee("CleanRemove", 3);
    await seats.assignSeats(db, actor, { committeeId: c.id, memberId: kamal.id, seatCount: 1 });
    const roster = await seats.listSeats(db, c.id);

    const r = await seats.removeSeat(db, actor, { seatId: roster.data.seats[0].id });
    expect(r.ok).toBe(true);

    const after = await seats.listSeats(db, c.id);
    expect(after.data.seatsTaken).toBe(0);
  });
});

describe("contribution and seat-count locks are independent", () => {
  it("locks the contribution once a payment exists, but keeps the roster flexible", async () => {
    // The exact scenario the user described: recruiting continues while early
    // cycles are already being collected. That must stay possible right up until
    // a draw happens — only the contribution amount is protected by a payment
    // having been recorded.
    const c = await makeCommittee("SplitLock", 2);
    await seats.assignSeats(db, actor, { committeeId: c.id, memberId: rahima.id, seatCount: 1 });
    await seats.assignSeats(db, actor, { committeeId: c.id, memberId: kamal.id, seatCount: 1 });

    const roster = await seats.listSeats(db, c.id);
    await payments.recordPayment(db, actor, {
      committeeId: c.id,
      committeeMemberId: roster.data.seats[0].id,
      cycleNumber: 1,
      amountMinor: toMinor("1000"),
      paidAt: new Date("2026-01-05T09:00:00Z"),
      method: "CASH",
      referenceNumber: null,
      notes: null,
      lateFeeOverrideMinor: null,
    });

    // Adding a THIRD seat must still work — no draw has happened, only a payment.
    const m3 = await prisma.member.create({
      data: { organizationId: org.id, fullName: `SplitLock3 ${SUFFIX}`, phone: "+8807200003" },
    });
    const grow = await seats.assignSeats(db, actor, {
      committeeId: c.id,
      memberId: m3.id,
      seatCount: 1,
    });
    expect(grow.ok).toBe(true);
    expect((await prisma.committee.findUnique({ where: { id: c.id } })).totalSeats).toBe(3);

    // But the contribution amount is locked now that money has moved.
    // updateCommittee takes the normalized Prisma-shaped input (see
    // normalizeCommitteeInput), not the display DTO — built directly from the raw
    // row here rather than spreading toCommitteeDto's formatted-string fields into
    // a Prisma update, which would fail on unknown-field names like
    // "contributionDisplay".
    const row = await prisma.committee.findUnique({ where: { id: c.id } });
    const changeContribution = await committees.updateCommittee(db, actor, c.id, {
      name: row.name,
      description: row.description,
      contributionMinor: toMinor("2000"),
      currency: row.currency,
      currencyExponent: row.currencyExponent,
      totalSeats: row.totalSeats,
      startDate: row.startDate,
      endDate: row.endDate,
      drawFrequency: row.drawFrequency,
      drawDay: row.drawDay,
      gracePeriodDays: row.gracePeriodDays,
      lateFeeType: row.lateFeeType,
      lateFeeFlatMinor: row.lateFeeFlatMinor,
      lateFeePercentBps: row.lateFeePercentBps,
      status: row.status,
    });
    expect(changeContribution.ok).toBe(false);
    expect(changeContribution.error.message).toContain("payments recorded");
  });
});

describe("the roster view answers the spec's questions", () => {
  it("reports Received Pot?, Payment Status and Remaining Installments per seat", async () => {
    const c = await makeCommittee("SpecView", 2);
    await seats.assignSeats(db, actor, { committeeId: c.id, memberId: rahima.id, seatCount: 1 });
    await seats.assignSeats(db, actor, { committeeId: c.id, memberId: kamal.id, seatCount: 1 });

    const roster = await seats.listSeats(db, c.id);
    await payCycle(c.id, roster.data.seats, 1);
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

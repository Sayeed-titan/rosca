/**
 * Draw service — integration, against the REAL database.
 *
 * The unit tests in draw.test.js prove the randomness is fair. These prove the
 * surrounding rules hold in Postgres: the collection gate, the override privilege,
 * no repeat winners, and — the one that can only be tested for real — that two
 * simultaneous draws cannot both succeed.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { prisma } from "@/core/db/prisma";
import { forOrganization } from "@/core/db/tenant";
import * as draws from "@/features/draws/service";
import * as payments from "@/features/payments/service";
import { toMinor } from "@/core/money";

const SUFFIX = `draw-${Date.now()}`;
let org;
let db;
let owner;
let manager;

beforeAll(async () => {
  org = await prisma.organization.create({
    data: { name: "Draw Test Org", slug: `draw-org-${SUFFIX}` },
  });
  db = forOrganization(org.id);

  const user = await prisma.user.create({
    data: { email: `drawrunner-${SUFFIX}@test.dev`, name: "Draw Runner" },
  });

  // Two actors with different powers — the override rule is about privilege.
  owner = { userId: user.id, name: "Owner", isSuperAdmin: false, organizationId: org.id, role: "ORG_OWNER" };
  manager = { userId: user.id, name: "Manager", isSuperAdmin: false, organizationId: org.id, role: "MANAGER" };
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: `draw-org-${SUFFIX}` } });
  await prisma.user.deleteMany({ where: { email: `drawrunner-${SUFFIX}@test.dev` } });
  await prisma.$disconnect();
});

/** A fresh, fully-populated committee. */
async function makeCommittee(name, memberCount = 3) {
  const committee = await prisma.committee.create({
    data: {
      organizationId: org.id,
      name: `${name} ${SUFFIX}`,
      contributionMinor: toMinor("1000"),
      currency: "BDT",
      currencyExponent: 2,
      totalSeats: memberCount,
      startDate: new Date("2026-01-05T00:00:00Z"),
      drawFrequency: "MONTHLY",
      drawDay: 5,
      gracePeriodDays: 3,
      lateFeeType: "NONE",
      status: "ACTIVE",
    },
  });

  const seats = [];
  for (let i = 0; i < memberCount; i++) {
    const member = await prisma.member.create({
      data: {
        organizationId: org.id,
        fullName: `${name} Member ${i + 1}`,
        phone: `+8801${Date.now()}${i}`.slice(0, 15),
      },
    });
    seats.push(
      await prisma.committeeMember.create({
        data: {
          organizationId: org.id,
          committeeId: committee.id,
          memberId: member.id,
          position: i + 1,
        },
      })
    );
  }

  return { committee, seats };
}

/** Everyone pays their contribution for one cycle. */
async function payCycle(committee, seats, cycleNumber) {
  for (const seat of seats) {
    await payments.recordPayment(db, owner, {
      committeeId: committee.id,
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

describe("the collection gate", () => {
  it("refuses to draw while members still owe, and names them", async () => {
    const { committee, seats } = await makeCommittee("Ungated");
    // Only the first member pays.
    await payments.recordPayment(db, owner, {
      committeeId: committee.id,
      committeeMemberId: seats[0].id,
      cycleNumber: 1,
      amountMinor: toMinor("1000"),
      paidAt: new Date("2026-01-05T09:00:00Z"),
      method: "CASH",
      referenceNumber: null,
      notes: null,
      lateFeeOverrideMinor: null,
    });

    const r = await draws.runDraw(db, owner, { committeeId: committee.id });

    expect(r.ok).toBe(false);
    expect(r.error.code).toBe("draw.incomplete_payments");
    // Naming who is short is the difference between a usable refusal and a wall.
    expect(r.error.message).toContain("Member 2");
    expect(r.error.message).toContain("Member 3");

    expect(await prisma.draw.count({ where: { committeeId: committee.id } })).toBe(0);
  });

  it("draws once everyone has paid", async () => {
    const { committee, seats } = await makeCommittee("Gated");
    await payCycle(committee, seats, 1);

    const r = await draws.runDraw(db, owner, { committeeId: committee.id });

    expect(r.ok).toBe(true);
    expect(r.data.cycleNumber).toBe(1);
    expect(r.data.winnerName).toBeTruthy();
    // 3 members x 1,000 = 3,000.
    expect(r.data.payoutDisplay).toBe("৳3,000.00");
    expect(r.data.isOverride).toBe(false);
  });
});

describe("the override privilege", () => {
  it("refuses an override from a MANAGER", async () => {
    const { committee } = await makeCommittee("ManagerOverride");

    const r = await draws.runDraw(db, manager, {
      committeeId: committee.id,
      override: true,
      overrideReason: "Everyone agreed verbally",
    });

    // Separation of duties: the person collecting must not be able to waive the
    // rule that protects the collection.
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe("auth.forbidden");
  });

  it("refuses an override with no reason, even from an OWNER", async () => {
    const { committee } = await makeCommittee("NoReason");

    const r = await draws.runDraw(db, owner, { committeeId: committee.id, override: true });

    expect(r.ok).toBe(false);
    expect(r.error.code).toBe("draw.override_reason_required");
  });

  it("allows an OWNER to override with a reason, and records it", async () => {
    const { committee } = await makeCommittee("Overridden");

    const r = await draws.runDraw(db, owner, {
      committeeId: committee.id,
      override: true,
      overrideReason: "Two members paid in cash offline; recorded next week",
    });

    expect(r.ok).toBe(true);
    expect(r.data.isOverride).toBe(true);
    expect(r.data.overrideReason).toContain("cash offline");

    // An override must never be quiet.
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: r.data.id, action: "draw.override" },
    });
    expect(audit).not.toBeNull();
    expect(audit.after.shortfalls.length).toBeGreaterThan(0);
  });
});

describe("no repeat winners", () => {
  it("gives every member exactly one win across a full committee", async () => {
    const { committee, seats } = await makeCommittee("FullLife", 3);

    const winners = [];
    for (let cycle = 1; cycle <= 3; cycle++) {
      await payCycle(committee, seats, cycle);
      const r = await draws.runDraw(db, owner, { committeeId: committee.id });
      expect(r.ok).toBe(true);
      winners.push(r.data.winnerId);
    }

    expect(winners).toHaveLength(3);
    expect(new Set(winners).size).toBe(3); // nobody twice
    expect([...winners].sort()).toEqual(seats.map((s) => s.id).sort());
  });

  it("marks the committee COMPLETED after the last cycle", async () => {
    const after = await prisma.committee.findFirst({
      where: { organizationId: org.id, name: `FullLife ${SUFFIX}` },
      select: { status: true },
    });
    expect(after.status).toBe("COMPLETED");
  });

  it("refuses to draw again once complete", async () => {
    const committee = await prisma.committee.findFirst({
      where: { organizationId: org.id, name: `FullLife ${SUFFIX}` },
    });
    const r = await draws.runDraw(db, owner, { committeeId: committee.id });
    expect(r.ok).toBe(false);
    expect(r.error.message).toContain("already finished");
  });
});

describe("concurrency", () => {
  it("lets exactly one of two simultaneous draws succeed", async () => {
    const { committee, seats } = await makeCommittee("RaceMe");
    await payCycle(committee, seats, 1);

    // The real scenario: an organiser double-clicks, or two admins draw at once.
    // Without the row lock and UNIQUE(committeeId, cycleNumber), both could land
    // and one cycle would pay out twice.
    const [a, b] = await Promise.all([
      draws.runDraw(db, owner, { committeeId: committee.id }),
      draws.runDraw(db, owner, { committeeId: committee.id }),
    ]);

    const succeeded = [a, b].filter((r) => r.ok);
    const failed = [a, b].filter((r) => !r.ok);

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);

    // And only one draw row exists — the constraint held.
    expect(await prisma.draw.count({ where: { committeeId: committee.id, cycleNumber: 1 } })).toBe(1);
    // Exactly one pot left the committee.
    expect(
      await prisma.transaction.count({ where: { committeeId: committee.id, type: "PAYOUT_OUT" } })
    ).toBe(1);
  });
});

describe("verification of a stored draw", () => {
  it("re-derives the winner from the stored seed and confirms it", async () => {
    const { committee, seats } = await makeCommittee("Verifiable");
    await payCycle(committee, seats, 1);

    const run = await draws.runDraw(db, owner, { committeeId: committee.id });
    expect(run.ok).toBe(true);

    const v = await draws.verifyStoredDraw(db, run.data.id);

    expect(v.ok).toBe(true);
    expect(v.data.valid).toBe(true);
    expect(v.data.winnerMatches).toBe(true);
    expect(v.data.recordedWinner).toBe(run.data.winnerName);
  });

  it("stores everything a third party needs to check it independently", async () => {
    const { committee, seats } = await makeCommittee("Auditable");
    await payCycle(committee, seats, 1);
    const run = await draws.runDraw(db, owner, { committeeId: committee.id });

    const row = await prisma.draw.findUnique({ where: { id: run.data.id } });

    expect(row.serverSeed).toMatch(/^[0-9a-f]{64}$/);
    expect(row.seedCommitment).toMatch(/^[0-9a-f]{64}$/);
    expect(Array.isArray(row.eligibleSnapshot)).toBe(true);
    expect(row.eligibleSnapshot).toHaveLength(3);
    expect(row.algorithmVersion).toBe(1);
    expect(row.winnerIndex).toBeGreaterThanOrEqual(0);
  });

  it("detects tampering with a stored draw", async () => {
    const { committee, seats } = await makeCommittee("Tampered");
    await payCycle(committee, seats, 1);
    const run = await draws.runDraw(db, owner, { committeeId: committee.id });

    // Someone edits the database directly to install a different winner index.
    const row = await prisma.draw.findUnique({ where: { id: run.data.id } });
    await prisma.draw.update({
      where: { id: run.data.id },
      data: { winnerIndex: (row.winnerIndex + 1) % row.eligibleSnapshot.length },
    });

    const v = await draws.verifyStoredDraw(db, run.data.id);

    // This is the whole point: even with full database access, a forged result
    // can't be made to verify without breaking SHA-256.
    expect(v.data.valid).toBe(false);
    expect(v.data.reason).toContain("does not match the derived index");
  });
});

describe("roster rules", () => {
  it("refuses to draw with an incomplete roster", async () => {
    const committee = await prisma.committee.create({
      data: {
        organizationId: org.id,
        name: `HalfEmpty ${SUFFIX}`,
        contributionMinor: toMinor("1000"),
        totalSeats: 5,
        startDate: new Date("2026-01-05"),
        status: "ACTIVE",
      },
    });

    const r = await draws.runDraw(db, owner, { committeeId: committee.id });
    expect(r.ok).toBe(false);
    expect(r.error.message).toContain("No members are assigned");
  });
});

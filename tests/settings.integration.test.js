/**
 * Organization settings + role management — against the REAL database.
 *
 * The role guards are the point. Both failure modes here are unrecoverable
 * through the UI: demote the last owner and nobody can ever manage the org
 * again; demote yourself and you've revoked the permission you'd need to undo
 * it. Neither is fixable without database surgery, so both are tested.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { prisma } from "@/core/db/prisma";
import { forOrganization } from "@/core/db/tenant";
import * as service from "@/features/organization/settings-service";

const SUFFIX = `settings-${Date.now()}`;
let org;
let db;
let ownerActor;
let ownerMembership;
let managerMembership;

beforeAll(async () => {
  org = await prisma.organization.create({
    data: { name: "Settings Test Org", slug: `settings-org-${SUFFIX}` },
  });
  db = forOrganization(org.id);

  const [ownerUser, managerUser] = await Promise.all([
    prisma.user.create({
      data: { email: `owner-${SUFFIX}@test.dev`, name: "The Owner" },
    }),
    prisma.user.create({
      data: { email: `manager-${SUFFIX}@test.dev`, name: "The Manager" },
    }),
  ]);

  [ownerMembership, managerMembership] = await Promise.all([
    prisma.membership.create({
      data: { organizationId: org.id, userId: ownerUser.id, role: "ORG_OWNER" },
    }),
    prisma.membership.create({
      data: { organizationId: org.id, userId: managerUser.id, role: "MANAGER" },
    }),
  ]);

  ownerActor = {
    userId: ownerUser.id,
    name: "The Owner",
    organizationId: org.id,
    role: "ORG_OWNER",
  };
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: `settings-org-${SUFFIX}` } });
  await prisma.user.deleteMany({
    where: { email: { in: [`owner-${SUFFIX}@test.dev`, `manager-${SUFFIX}@test.dev`] } },
  });
  await prisma.$disconnect();
});

describe("organization settings", () => {
  it("updates name, currency and timezone, and audits the change", async () => {
    const r = await service.updateOrganizationSettings(db, ownerActor, {
      name: "Renamed Org",
      currency: "USD",
      timezone: "UTC",
    });

    expect(r.ok).toBe(true);
    expect(r.data.name).toBe("Renamed Org");
    expect(r.data.currency).toBe("USD");

    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: org.id, action: "org.update" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit.before.name).toBe("Settings Test Org");
    expect(audit.after.name).toBe("Renamed Org");
  });
});

describe("role changes — the guards that prevent locking everyone out", () => {
  it("refuses to demote the LAST owner", async () => {
    // Only one owner exists. Demoting them leaves an organization nobody can
    // manage — no settings, no roles, no way back without database surgery.
    const r = await service.changeMemberRole(db, ownerActor, {
      membershipId: ownerMembership.id,
      role: "MANAGER",
    });

    expect(r.ok).toBe(false);
    expect(r.error.message).toContain("only owner");

    const unchanged = await prisma.membership.findUnique({
      where: { id: ownerMembership.id },
      select: { role: true },
    });
    expect(unchanged.role).toBe("ORG_OWNER");
  });

  it("refuses to let you change your OWN role, even with another owner present", async () => {
    // A second owner is required to reach this guard at all: with only one
    // owner, the last-owner check fires first (and should — that's the real
    // problem in that case). Self-demotion is still a one-way trapdoor even
    // when the org would survive it, so it's blocked independently.
    const secondOwnerUser = await prisma.user.create({
      data: { email: `owner2-${SUFFIX}@test.dev`, name: "Second Owner" },
    });
    await prisma.membership.create({
      data: { organizationId: org.id, userId: secondOwnerUser.id, role: "ORG_OWNER" },
    });

    const r = await service.changeMemberRole(db, ownerActor, {
      membershipId: ownerMembership.id,
      role: "MANAGER",
    });

    expect(r.ok).toBe(false);
    expect(r.error.message).toContain("your own role");

    await prisma.user.delete({ where: { id: secondOwnerUser.id } });
  });

  it("promotes a manager to owner", async () => {
    const r = await service.changeMemberRole(db, ownerActor, {
      membershipId: managerMembership.id,
      role: "ORG_OWNER",
    });

    expect(r.ok).toBe(true);
    expect(r.data.role).toBe("ORG_OWNER");
  });

  it("allows demoting an owner once another owner exists", async () => {
    // The manager was promoted above, so there are two owners now — demoting
    // one is safe and must be allowed.
    const r = await service.changeMemberRole(db, ownerActor, {
      membershipId: managerMembership.id,
      role: "MANAGER",
    });

    expect(r.ok).toBe(true);
    expect(r.data.role).toBe("MANAGER");
  });

  it("audits every role change with before and after", async () => {
    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: org.id, action: "org.member_role_change" },
      orderBy: { createdAt: "desc" },
    });

    expect(audit).not.toBeNull();
    expect(audit.before.role).toBeTruthy();
    expect(audit.after.role).toBeTruthy();
    expect(audit.before.role).not.toBe(audit.after.role);
  });

  it("is a no-op when the role is unchanged", async () => {
    const r = await service.changeMemberRole(db, ownerActor, {
      membershipId: managerMembership.id,
      role: "MANAGER",
    });
    expect(r.ok).toBe(true);
  });
});

describe("listTeam", () => {
  it("returns everyone with a login, with their role", async () => {
    const team = await service.listTeam(db);
    expect(team.length).toBeGreaterThanOrEqual(2);
    expect(team.every((m) => m.email && m.role)).toBe(true);
  });
});

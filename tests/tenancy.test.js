/**
 * Cross-tenant isolation — the security test that matters most.
 *
 * This runs against the REAL database, not a mock. A mocked tenancy test only
 * proves the mock agrees with itself; the thing we actually need to know is
 * whether Postgres hands over another organization's rows.
 *
 * Structure: two organizations with deliberately similar data, then a scoped
 * client for org A tries every way we could think of to touch org B.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { prisma } from "@/core/db/prisma";
import { forOrganization } from "@/core/db/tenant";
import { MissingTenantScopeError } from "@/core/errors";

const SUFFIX = `test-${Date.now()}`;
let orgA;
let orgB;
let memberA;
let memberB;

beforeAll(async () => {
  orgA = await prisma.organization.create({
    data: { name: "Tenant A", slug: `tenant-a-${SUFFIX}` },
  });
  orgB = await prisma.organization.create({
    data: { name: "Tenant B", slug: `tenant-b-${SUFFIX}` },
  });

  memberA = await prisma.member.create({
    data: {
      organizationId: orgA.id,
      fullName: "Alice OrgA",
      phone: "+880000000001",
    },
  });
  memberB = await prisma.member.create({
    data: {
      organizationId: orgB.id,
      fullName: "Bob OrgB",
      phone: "+880000000002",
    },
  });
});

afterAll(async () => {
  // Cascades clean up members/committees.
  await prisma.organization.deleteMany({
    where: { slug: { in: [`tenant-a-${SUFFIX}`, `tenant-b-${SUFFIX}`] } },
  });
  await prisma.$disconnect();
});

describe("reads are confined to the scoped organization", () => {
  it("findMany returns only this org's rows", async () => {
    const db = forOrganization(orgA.id);
    const members = await db.member.findMany();

    expect(members).toHaveLength(1);
    expect(members[0].id).toBe(memberA.id);
    expect(members.map((m) => m.organizationId)).not.toContain(orgB.id);
  });

  it("findUnique by another org's id returns null, not the row", async () => {
    // The attack: the id is valid and guessable, and it exists. Only the tenant
    // filter stands between the caller and someone else's data.
    const db = forOrganization(orgA.id);
    const stolen = await db.member.findUnique({ where: { id: memberB.id } });

    expect(stolen).toBeNull();
  });

  it("findFirst cannot be widened by passing another org's id", async () => {
    const db = forOrganization(orgA.id);
    // Caller tries to override the scope. Ours is applied last and wins.
    const stolen = await db.member.findFirst({
      where: { organizationId: orgB.id },
    });

    expect(stolen).toBeNull();
  });

  it("count only counts this org", async () => {
    const dbA = forOrganization(orgA.id);
    const dbB = forOrganization(orgB.id);

    expect(await dbA.member.count()).toBe(1);
    expect(await dbB.member.count()).toBe(1);
    // Unscoped, both exist — proving the scoping is what's doing the work.
    expect(
      await prisma.member.count({
        where: { organizationId: { in: [orgA.id, orgB.id] } },
      })
    ).toBe(2);
  });

  it("scopes the Organization row itself by id", async () => {
    const db = forOrganization(orgA.id);
    expect(await db.organization.findMany()).toHaveLength(1);
    expect(await db.organization.findUnique({ where: { id: orgB.id } })).toBeNull();
  });
});

describe("writes cannot escape the scope", () => {
  it("create stamps this org even when the caller forges another", async () => {
    const db = forOrganization(orgA.id);

    const created = await db.member.create({
      data: {
        // Hostile input: caller claims to be writing into org B.
        organizationId: orgB.id,
        fullName: "Forged Member",
        phone: "+880000000003",
      },
    });

    expect(created.organizationId).toBe(orgA.id);
    expect(created.organizationId).not.toBe(orgB.id);
  });

  it("update cannot modify another org's row", async () => {
    const db = forOrganization(orgA.id);

    await expect(
      db.member.update({
        where: { id: memberB.id },
        data: { fullName: "Hacked" },
      })
    ).rejects.toThrow(); // P2025: no row matched id AND organizationId

    const untouched = await prisma.member.findUnique({ where: { id: memberB.id } });
    expect(untouched.fullName).toBe("Bob OrgB");
  });

  it("updateMany silently affects zero of another org's rows", async () => {
    const db = forOrganization(orgA.id);

    const result = await db.member.updateMany({
      where: { organizationId: orgB.id },
      data: { fullName: "Hacked" },
    });

    expect(result.count).toBe(0);
    const untouched = await prisma.member.findUnique({ where: { id: memberB.id } });
    expect(untouched.fullName).toBe("Bob OrgB");
  });

  it("delete cannot remove another org's row", async () => {
    const db = forOrganization(orgA.id);

    await expect(
      db.member.delete({ where: { id: memberB.id } })
    ).rejects.toThrow();

    expect(
      await prisma.member.findUnique({ where: { id: memberB.id } })
    ).not.toBeNull();
  });

  it("deleteMany cannot wipe another org", async () => {
    const db = forOrganization(orgA.id);

    const result = await db.member.deleteMany({
      where: { organizationId: orgB.id },
    });

    expect(result.count).toBe(0);
    expect(await prisma.member.count({ where: { organizationId: orgB.id } })).toBe(1);
  });
});

describe("the scope cannot be omitted", () => {
  it("refuses to build a client without an organization id", () => {
    expect(() => forOrganization(undefined)).toThrow(MissingTenantScopeError);
    expect(() => forOrganization(null)).toThrow(MissingTenantScopeError);
    expect(() => forOrganization("")).toThrow(MissingTenantScopeError);
  });
});

describe("global (non-tenant) models are left alone", () => {
  it("does not inject organizationId into User, which has no such column", async () => {
    const db = forOrganization(orgA.id);
    // Would throw if the extension wrongly added organizationId to User.
    await expect(db.user.count()).resolves.toBeTypeOf("number");
  });
});

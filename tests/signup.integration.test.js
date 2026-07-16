/**
 * Signup — integration, against the REAL database.
 *
 * Registration is the one write that creates a tenant rather than living inside
 * one, so it uses unscopedDb. That makes it worth testing hard: a bug here
 * either blocks onboarding entirely or, worse, creates a user with no working
 * organization.
 */
import { describe, it, expect, afterAll } from "vitest";

import { prisma } from "@/core/db/prisma";
import { registerOwner } from "@/features/auth/signup-service";
import { verifyPassword } from "@/core/auth/password";

const SUFFIX = `signup-${Date.now()}`;
const createdEmails = [];
const createdOrgIds = [];

async function register(over = {}) {
  const email = over.email ?? `owner-${SUFFIX}-${createdEmails.length}@test.dev`;
  createdEmails.push(email);

  const result = await registerOwner({
    name: "Test Owner",
    email,
    organizationName: `Test Org ${SUFFIX}`,
    password: "CorrectHorse123",
    ...over,
    email,
  });

  if (result.ok) createdOrgIds.push(result.data.organization.id);
  return result;
}

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe("registerOwner", () => {
  it("creates the user, the organization and an ORG_OWNER membership", async () => {
    const r = await register();
    expect(r.ok).toBe(true);

    const membership = await prisma.membership.findFirst({
      where: { userId: r.data.user.id },
      select: { role: true, organizationId: true },
    });

    // Without the membership the account exists but lands on /no-organization
    // and can do nothing — the three rows are only useful together.
    expect(membership).not.toBeNull();
    expect(membership.role).toBe("ORG_OWNER");
    expect(membership.organizationId).toBe(r.data.organization.id);
  });

  it("hashes the password — never stores it in plain text", async () => {
    const r = await register({ password: "SuperSecret123" });

    const user = await prisma.user.findUnique({
      where: { id: r.data.user.id },
      select: { passwordHash: true },
    });

    expect(user.passwordHash).not.toBe("SuperSecret123");
    expect(user.passwordHash.startsWith("$argon2id$")).toBe(true);
    // And the hash must actually verify, or the account is unusable.
    expect(await verifyPassword(user.passwordHash, "SuperSecret123")).toBe(true);
    expect(await verifyPassword(user.passwordHash, "WrongPassword1")).toBe(false);
  });

  it("normalises the email to lowercase so sign-in matches", async () => {
    const upper = `MiXeD-${SUFFIX}@Test.Dev`;
    const r = await register({ email: upper });
    expect(r.ok).toBe(true);
    expect(r.data.user.email).toBe(upper.toLowerCase());
  });

  it("refuses a duplicate email rather than silently creating a second account", async () => {
    const email = `dupe-${SUFFIX}@test.dev`;
    const first = await register({ email });
    expect(first.ok).toBe(true);

    const second = await register({ email });
    expect(second.ok).toBe(false);
    expect(second.error.code).toBe("resource.conflict");
    expect(second.error.details.fields.email).toBeTruthy();
  });

  it("gives two organizations with the same name distinct slugs", async () => {
    // Organization.slug is UNIQUE. Two people naming their org "Dhaka Savings"
    // must both succeed — the second would otherwise die on a raw constraint.
    const name = `Collide ${SUFFIX}`;
    const a = await register({ organizationName: name });
    const b = await register({ organizationName: name });

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a.data.organization.slug).not.toBe(b.data.organization.slug);
    expect(b.data.organization.slug).toMatch(/-2$/);
    // Same display name, though — only the slug disambiguates.
    expect(b.data.organization.name).toBe(name);
  });

  it("slugifies punctuation and case out of the org name", async () => {
    const r = await register({ organizationName: "Global Mediklaud (BD) Limited!" });
    expect(r.data.organization.slug).toBe("global-mediklaud-bd-limited");
  });

  it("never creates a super admin from public signup", async () => {
    // A public form that could mint platform operators would be a privilege
    // escalation hole. isSuperAdmin is hard-coded false, not read from input.
    const r = await register({ isSuperAdmin: true });

    const user = await prisma.user.findUnique({
      where: { id: r.data.user.id },
      select: { isSuperAdmin: true },
    });
    expect(user.isSuperAdmin).toBe(false);
  });

  it("audits the signup against the new organization", async () => {
    const r = await register();

    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: r.data.organization.id, action: "auth.signup" },
    });
    expect(audit).not.toBeNull();
    expect(audit.actorUserId).toBe(r.data.user.id);
    // The password must never reach the audit table.
    expect(JSON.stringify(audit.after)).not.toContain("CorrectHorse123");
  });
});

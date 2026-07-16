import "server-only";

import { unscopedDb } from "@/core/db/tenant";
import { hashPassword } from "@/core/auth/password";
import { writeAudit, AuditAction } from "@/core/audit";
import { ok, err } from "@/core/result";
import { ErrorCode } from "@/core/errors";

/**
 * Registration — creates a User, their Organization, and the ORG_OWNER
 * Membership binding the two.
 *
 * Uses unscopedDb deliberately, and it's one of the few legitimate places to:
 * there is no organization to scope to yet — this is the code that creates one.
 * Every write below is either the new org's own row or explicitly stamped with
 * its id, so nothing here can touch another tenant.
 */

/**
 * "Global Mediklaud (BD) Limited" -> "global-mediklaud-bd-limited"
 * Punctuation is dropped rather than encoded, so the slug stays URL-clean.
 */
function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Organization.slug is UNIQUE, so two orgs called "Dhaka Savings" must not
 * collide — the second signup would otherwise die on a constraint violation
 * with a meaningless error. Appends -2, -3... until free.
 *
 * Runs inside the caller's transaction so the check and the insert can't be
 * interleaved by a concurrent signup; the unique index is still the real
 * backstop if two requests somehow race here.
 */
async function uniqueSlug(tx, base) {
  const root = slugify(base) || "org";

  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? root : `${root}-${attempt + 1}`;
    const taken = await tx.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }

  // Vanishingly unlikely; a random suffix is better than looping forever.
  return `${root}-${Date.now().toString(36)}`;
}

export async function registerOwner({ name, email, organizationName, password }) {
  const db = unscopedDb();
  const normalizedEmail = email.trim().toLowerCase();

  // Friendly pre-check. The unique index on User.email is still what actually
  // guarantees it — this exists so the message names the real problem instead of
  // surfacing a raw constraint error.
  const existing = await db.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });
  if (existing) {
    return err(ErrorCode.CONFLICT, "An account with that email already exists.", {
      fields: { email: ["Already registered — sign in instead"] },
    });
  }

  // Hash BEFORE opening the transaction. Argon2id is deliberately slow (~19MiB,
  // 2 passes); doing it inside would hold a database transaction open for the
  // whole hash, for no reason.
  const passwordHash = await hashPassword(password);

  try {
    const result = await db.$transaction(async (tx) => {
      const slug = await uniqueSlug(tx, organizationName);

      const organization = await tx.organization.create({
        data: { name: organizationName.trim(), slug },
        select: { id: true, name: true, slug: true },
      });

      const user = await tx.user.create({
        data: {
          name: name.trim(),
          email: normalizedEmail,
          passwordHash,
          // Never set from signup input. A public form that could mint platform
          // operators would be a privilege-escalation hole.
          isSuperAdmin: false,
        },
        select: { id: true, name: true, email: true },
      });

      await tx.membership.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          // The person who creates the org owns it.
          role: "ORG_OWNER",
        },
      });

      await writeAudit(tx, {
        organizationId: organization.id,
        actorUserId: user.id,
        action: AuditAction.SIGNUP,
        entityType: "Organization",
        entityId: organization.id,
        after: {
          organizationName: organization.name,
          slug: organization.slug,
          ownerEmail: user.email,
        },
      });

      return { user, organization };
    });

    return ok(result);
  } catch (error) {
    // Lost a race against a concurrent signup with the same email.
    if (error?.code === "P2002") {
      return err(ErrorCode.CONFLICT, "An account with that email already exists.", {
        fields: { email: ["Already registered — sign in instead"] },
      });
    }
    throw error;
  }
}

/**
 * Auth.js v5 configuration.
 *
 * Two decisions worth knowing about:
 *
 * 1. JWT session strategy. Not a preference — the Credentials provider cannot use
 *    database sessions. The Prisma adapter stays wired up so OAuth providers can be
 *    added later without a migration.
 *
 * 2. The token carries ONLY identity (userId, isSuperAdmin) — never the org role.
 *    Roles are resolved from the database on each request (see session.js). If the
 *    role lived in the JWT, demoting or removing someone would not take effect
 *    until their token expired: they would keep MANAGER rights for up to 30 days
 *    after being removed. For an app holding other people's savings, that is not
 *    an acceptable window. The cost is one indexed lookup per request.
 *
 * Note: no split "edge-safe" config, which most Auth.js v5 guides insist on.
 * Next 16's `proxy` runs on the Node runtime and cannot use edge, so the split
 * has nothing left to solve.
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { prisma } from "@/core/db/prisma";
import { verifyPassword } from "./password";
import { writeAudit, AuditAction } from "@/core/audit";

/**
 * Per-process login throttle.
 *
 * HONEST LIMITATION: in-memory, so it protects a single instance only. On multiple
 * instances an attacker gets N x the attempts. It is a speed bump, not a control —
 * a Postgres- or Redis-backed limiter is required before production. Kept because a
 * speed bump plus an audit trail beats nothing while the app is single-instance.
 */
const attempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function tooManyAttempts(key) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now - rec.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: now });
    return false;
  }
  rec.count += 1;
  return rec.count > MAX_ATTEMPTS;
}

function clearAttempts(key) {
  attempts.delete(key);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  trustHost: true,
  pages: { signIn: "/login", error: "/login" },

  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");

        if (!email || !password) return null;
        if (tooManyAttempts(email)) return null;

        const user = await prisma.user.findUnique({ where: { email } });

        // Verify even when the user is missing or has no password, so the response
        // time doesn't reveal which emails exist (timing oracle).
        const valid = await verifyPassword(user?.passwordHash, password);

        if (!user || !valid || user.deletedAt) {
          // Failed logins are exactly what an audit trail is for.
          await writeAudit(prisma, {
            action: AuditAction.LOGIN_FAILED,
            entityType: "User",
            entityId: user?.id ?? null,
            after: { email },
          }).catch(() => {});
          return null;
        }

        clearAttempts(email);

        // Attribute the login to every organization this user belongs to.
        //
        // Login isn't inherently an org-scoped action — there's no active org yet at
        // this point. But "a member of your organization signed in" is absolutely
        // something that org's owner should see, and an audit row with a null
        // organizationId is invisible to the tenant-scoped dashboard query.
        //
        // One row per membership: for the normal single-org user that's exactly one.
        // A user with no memberships still gets a platform-level (null org) row so
        // the event is never lost.
        const memberships = await prisma.membership.findMany({
          where: { userId: user.id, deletedAt: null },
          select: { organizationId: true },
        });

        const orgIds = memberships.length
          ? memberships.map((m) => m.organizationId)
          : [null];

        await Promise.all(
          orgIds.map((organizationId) =>
            writeAudit(prisma, {
              action: AuditAction.LOGIN,
              organizationId,
              actorUserId: user.id,
              entityType: "User",
              entityId: user.id,
            }).catch(() => {})
          )
        );

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          isSuperAdmin: user.isSuperAdmin,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.isSuperAdmin = Boolean(user.isSuperAdmin);
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId;
        session.user.isSuperAdmin = Boolean(token.isSuperAdmin);
      }
      return session;
    },
  },
});

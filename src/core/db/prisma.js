/**
 * The base Prisma client — the single place the generated client is constructed.
 *
 * Prisma 7 specifics that differ from most documentation:
 *  - A driver adapter is mandatory; there is no built-in connection pool any more.
 *  - The client is imported from our generated output path, NOT from "@prisma/client".
 *  - `$use` middleware no longer exists. Cross-cutting concerns (tenant scoping,
 *    soft delete) are Client Extensions instead — see ./tenant.js.
 *
 * IMPORTANT: feature code must not import this directly. It receives an
 * org-scoped client from the tenant extension, so that a query physically cannot
 * be written without an organizationId filter.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * The adapter needs a real Postgres connection string. It rejects Prisma Accelerate
 * URLs (prisma:// or prisma+postgres://) — we always talk straight to Supabase.
 */
function createClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in."
    );
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });
}

/**
 * Next dev reloads modules on every edit; without caching on globalThis each reload
 * would open a new pool and exhaust Supabase's connection limit.
 */
const globalForPrisma = globalThis;

export const prisma = globalForPrisma.__circlefundPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__circlefundPrisma = prisma;
}

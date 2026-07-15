/**
 * Stage 1 gate: proves the whole Prisma 7 path actually works inside Next 16.
 *
 * This deliberately runs a raw query rather than a model query — it needs no
 * migration, so it isolates exactly the risk we care about:
 *   1. the ESM-only Prisma 7 client resolves under Turbopack,
 *   2. @prisma/adapter-pg connects to Supabase,
 *   3. a query round-trips from a Next route handler.
 *
 * Kept permanently as a liveness probe.
 */
import { prisma } from "@/core/db/prisma";

// Never prerender a health check — it must hit the database on every request.
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();

  try {
    const rows = await prisma.$queryRaw`
      select 1 as ok, current_database() as database, version() as version
    `;

    return Response.json({
      ok: true,
      latencyMs: Date.now() - startedAt,
      database: rows[0]?.database,
      postgres: rows[0]?.version,
    });
  } catch (error) {
    // Surface the real reason; a health check that hides the cause is useless.
    return Response.json(
      { ok: false, latencyMs: Date.now() - startedAt, error: error.message },
      { status: 500 }
    );
  }
}

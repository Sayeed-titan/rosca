// Prisma 7 requires this file to be named exactly `prisma.config.ts` — it is the only
// filename the CLI recognises. It stays TypeScript even though the app is JavaScript;
// it is tooling config, not application code.
//
// Migrations run over DIRECT_URL (Supabase *session* pooler / direct connection) because
// the transaction pooler does not support the prepared statements the schema engine needs.
// Application queries use DATABASE_URL (transaction pooler) — see src/core/db/prisma.js.
import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

// The Prisma CLI runs outside Next, so it does not inherit Next's env loading.
// Load `.env.local` first (real secrets, git-ignored), then `.env` as a fallback.
// dotenv does not overwrite already-set vars, so .env.local wins, and real
// environment variables (CI/production) beat both.
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DIRECT_URL"),
  },
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.js",
  },
});

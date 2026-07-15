import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.js"],
    // Integration tests hit the real Supabase database; the default 5s is too
    // tight for a round trip to Singapore.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    include: ["tests/**/*.test.js"],
    // Integration suites create and drop their own org. Running files in parallel
    // against one database invites cross-talk, so keep them sequential.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws by default; its package exports resolve to an empty
      // module under the "react-server" condition. Services legitimately import it
      // (they must never reach a client bundle), but a Node test runner isn't a
      // client bundle — so point it at the no-op build rather than delete the guard.
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.js", import.meta.url)
      ),
    },
  },
});

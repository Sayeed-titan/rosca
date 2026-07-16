import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.js"],
    // Integration tests hit the real Supabase database; the default 5s is far too
    // tight for a round trip to Singapore (observed 150-700ms each). A test that
    // does a full committee lifecycle awaits dozens of sequential round trips
    // (assign seats, pay every seat for several cycles, draw each cycle), which
    // can approach 30s under ordinary latency variance with no bug involved — seen
    // directly: 25/26 draw integration tests passed, the one failure was a
    // `Test timed out in 30000ms` on the single chattiest test, not a wrong result.
    testTimeout: 60_000,
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

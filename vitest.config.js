import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.js"],
    // Integration tests hit the real Supabase database; the default 5s is too
    // tight for a round trip to Singapore.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ["tests/**/*.test.js"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});

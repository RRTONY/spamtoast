import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit and component tests. Tests live in __tests__/, mirroring src/
// (src/lib/utils.ts → __tests__/lib/utils.test.ts). Shared fakes for Next.js
// and email are in __tests__/setup.ts, so no test ever sends an email or
// touches the network.
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@/": `${path.resolve(import.meta.dirname, "src")}/`,
      "@tests/": `${path.resolve(import.meta.dirname, "__tests__")}/`,
      // `import "server-only"` throws outside Next's bundler.
      "server-only": path.resolve(import.meta.dirname, "__tests__/helpers/empty-module.ts"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["__tests__/**/*.test.{ts,tsx}"],
    setupFiles: ["__tests__/setup.ts"],
    css: false,
    // Before each test every vi.fn() goes back to the behaviour it was created
    // with (and spies are undone), so set per-test behaviour in beforeEach.
    mockReset: true,
    restoreMocks: true,
    // Form tests type key by key; under load (a full run) they need headroom.
    testTimeout: 60000,
    // `pnpm test:changed` runs only the tests a change touches. Vitest's
    // default also reruns everything when package.json changes; only these
    // really affect every test: this config, the shared setup, and a
    // dependency change (the lockfile).
    forceRerunTriggers: [
      "**/vitest.config.*",
      "**/__tests__/setup.ts",
      "**/pnpm-lock.yaml",
    ],
    // `pnpm test:coverage`: every file in src/ must have 90% of its lines and
    // statements run by its tests. perFile: one badly covered file fails the
    // run even when the total is high.
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      reporter: ["text-summary", "json-summary", "html"],
      reportsDirectory: "coverage",
      thresholds: { perFile: true, lines: 90, statements: 90 },
    },
    env: {
      NEXT_PUBLIC_SITE_URL: "https://spamtoast.com",
      CONFRONT_LINK_SECRET: "test-confront-secret",
    },
  },
});

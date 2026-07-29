import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Only *.test.ts(x) — never *.spec.ts, which is Playwright's
    // convention (tests/e2e/**/*.spec.ts, playwright.config.ts). Keeps the
    // two suites fully separate: `npm test` never tries to run a
    // Playwright spec through Vitest's runner, and vice versa.
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

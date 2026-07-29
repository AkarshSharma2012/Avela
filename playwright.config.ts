/**
 * Playwright E2E suite (Milestone 10.8, spec sections 16-18) — a permanent,
 * reusable harness kept fully separate from `npm test` (Vitest): this file
 * only ever discovers tests/e2e/**\/*.spec.ts, never the *.test.ts unit
 * suite, and `npm test` never picks up *.spec.ts files either (see
 * vitest.config.ts's include pattern).
 *
 * Safety-critical: requireIsolatedE2eBackend() runs at config-load time,
 * before Playwright ever spawns the dev server — a misconfigured or
 * production-matching E2E backend fails loudly here, before any browser
 * opens or any request is made. The dev server it starts is handed the
 * isolated E2E Supabase credentials via `env`, not the app's normal
 * process.env — so every Supabase call the app makes while under test
 * (client-side and server actions alike) goes to the isolated project,
 * never production, regardless of what's in the shell's own environment.
 *
 * baseURL is hardcoded to the local dev server — never derived from
 * NEXT_PUBLIC_APP_URL, which points at the real deployed production app.
 */

import { defineConfig, devices } from "@playwright/test";

import { requireIsolatedE2eBackend } from "./src/lib/e2e/config";

const PORT = 3100; // Deliberately not 3000 — never collides with a developer's own `next dev` on the default port.
const BASE_URL = `http://localhost:${PORT}`;

const isolated = requireIsolatedE2eBackend();

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      // The isolated E2E project only — every one of the app's normal
      // Supabase env vars is overridden here, never inherited from the
      // ambient shell environment (which may still hold production
      // values for the app's own `npm run dev`).
      NEXT_PUBLIC_SUPABASE_URL: isolated.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: isolated.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: isolated.serviceRoleKey,
      NEXT_PUBLIC_APP_URL: BASE_URL,
      ALLOW_E2E_TEST_USERS: "true",
      E2E_SUPABASE_URL: isolated.url,
      E2E_SUPABASE_ANON_KEY: isolated.anonKey,
      E2E_SUPABASE_SERVICE_ROLE_KEY: isolated.serviceRoleKey,
    },
  },
});

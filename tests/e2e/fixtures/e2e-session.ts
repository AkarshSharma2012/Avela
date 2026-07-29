/**
 * The shared Playwright fixture every scenario spec uses (Phase 10) — seeds
 * exactly one E2E persona via src/lib/e2e/seed.ts, signs in through the
 * real login form (never a session bypass), yields it to the test, and
 * tears down only that one persona afterward (deleteSingleE2eUser, not the
 * global sweep — safe under `fullyParallel: true`, where many personas may
 * be seeded at once). Relative imports, not the "@/" alias: Playwright's
 * own module resolution doesn't read tsconfig paths, the same reason
 * scripts/*.ts uses relative imports.
 */

import { test as base, expect } from "@playwright/test";

import { deleteSingleE2eUser } from "../../../src/lib/e2e/cleanup";
import type { E2ePersonaKey } from "../../../src/lib/e2e/personas";
import { seedE2ePersonas, type SeededE2ePersona } from "../../../src/lib/e2e/seed";

export type E2eSessionFixtures = {
  personaKey: E2ePersonaKey;
  e2eSession: SeededE2ePersona;
};

export const test = base.extend<E2eSessionFixtures>({
  personaKey: ["digital_creator", { option: true }],

  e2eSession: async ({ page, personaKey }, use) => {
    const { seeded, errors } = await seedE2ePersonas({ personaKeys: [personaKey] });
    if (errors.length > 0 || seeded.length === 0) {
      throw new Error(`Failed to seed E2E persona "${personaKey}": ${errors.join(", ") || "unknown error"}`);
    }
    const session = seeded[0]!;

    await page.goto("/login");
    await page.getByLabel("Email").fill(session.email);
    await page.getByLabel("Password", { exact: true }).fill(session.password);
    await page.getByRole("button", { name: /log in/i }).click();
    await page.waitForURL(/\/(dashboard|onboarding|portfolio)/, { timeout: 30_000 });

    await use(session);

    const { error } = await deleteSingleE2eUser(session.userId);
    if (error) {
      // Never fails the test over a teardown hiccup — Phase 11's global
      // sweep (npm run e2e:cleanup) is the safety net for anything a
      // per-test teardown missed.
      console.error(`[e2e] Failed to clean up persona ${session.email}: ${error}`);
    }
  },
});

export { expect };

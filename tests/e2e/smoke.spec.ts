/**
 * Proves the Playwright harness itself works end-to-end — seeded persona,
 * real login, real page load, zero console/runtime errors — before Phase
 * 10's 35-scenario matrix relies on it. Kept intentionally small.
 */

import { test, expect } from "./fixtures/e2e-session";
import { captureConsoleAndPageErrors } from "./helpers/portfolio-flow";

test.use({ personaKey: "digital_creator" });

test("a seeded persona can sign in and load the portfolio page with no console or runtime errors", async ({ page, e2eSession }) => {
  const { consoleErrors, pageErrors } = captureConsoleAndPageErrors(page);

  await page.goto("/portfolio");
  await expect(page).toHaveURL(/\/portfolio/);

  // The seeded sample item's title always carries the E2E marker — visible
  // proof the fixture's seed step actually ran against this session.
  await expect(page.getByText(e2eSession.persona.sampleItemTitle).first()).toBeVisible();

  expect(consoleErrors, `console errors: ${consoleErrors.join("; ")}`).toEqual([]);
  expect(pageErrors, `runtime errors: ${pageErrors.join("; ")}`).toEqual([]);
});

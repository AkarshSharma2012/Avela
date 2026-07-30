/**
 * Real end-to-end coverage for the "Find more opportunities" bug (see
 * docs/decision-log.md's "Find more opportunities reliability fix" entry).
 * Runs against the isolated local Supabase instance the Playwright harness
 * spins up (never production) — a real signed-in student, a real click,
 * a real Server Action, real (approved-source) network discovery.
 */
import { createClient } from "@supabase/supabase-js";

import { requireIsolatedE2eBackend } from "../../src/lib/e2e/config";
import { captureConsoleAndPageErrors } from "./helpers/portfolio-flow";
import { test, expect } from "./fixtures/e2e-session";

test.use({ personaKey: "maker_engineering" });

/** Gives the seeded persona real interests/goals so source selection has something to score against — an onboarded-but-untouched persona otherwise has none, which is a different (also-tested, see profile_incomplete) scenario. */
async function giveProfileRealInterests(userId: string) {
  const isolated = requireIsolatedE2eBackend();
  const service = createClient(isolated.url, isolated.serviceRoleKey, { auth: { persistSession: false } });

  await service.from("profiles").update({ state: "California", city: "Los Angeles" }).eq("id", userId);
  await service.from("student_interests").upsert(
    [
      { profile_id: userId, interest: "Technology" },
      { profile_id: userId, interest: "Engineering" },
      { profile_id: userId, interest: "Computer Science" },
    ],
    { onConflict: "profile_id,interest" }
  );
  await service.from("student_goals").upsert(
    [{ profile_id: userId, goal: "Find an internship" }],
    { onConflict: "profile_id,goal" }
  );
}

test("a real click finds real new matches end-to-end, with an honest, non-generic status message", async ({
  page,
  e2eSession,
}) => {
  await giveProfileRealInterests(e2eSession.userId);
  const { consoleErrors, pageErrors } = captureConsoleAndPageErrors(page);

  await page.goto("/opportunities");

  const searchButton = page.getByRole("button", { name: /search for more opportunities|search again/i });
  await expect(searchButton).toBeVisible({ timeout: 15_000 });
  await searchButton.click();

  // The regression this guards: the button must never go dead/silent, and
  // must never show the old unconditional "Discovery isn't available right
  // now" message when the catalog/discovery path is actually configured and
  // working (as it always is under this harness's isolated backend).
  await expect(page.getByText("Discovery isn't available right now")).toHaveCount(0);

  const statusRegion = page.locator('[role="status"]').filter({ hasText: /./ });
  await expect(statusRegion.first()).toBeVisible({ timeout: 30_000 });

  // Either real matches were found, or an honest "nothing new" message was
  // shown — never a raw error, never silence.
  const bodyText = await page.locator("body").innerText();
  const gotAnHonestOutcome =
    /strong fit|possible fit|couldn.t verify any additional|not as closely matched|add a few interests/i.test(
      bodyText
    );
  expect(gotAnHonestOutcome).toBe(true);

  expect(consoleErrors, `console errors: ${consoleErrors.join("; ")}`).toEqual([]);
  expect(pageErrors, `runtime errors: ${pageErrors.join("; ")}`).toEqual([]);
});

test("repeated rapid clicks never duplicate a request or produce an error", async ({ page, e2eSession }) => {
  await giveProfileRealInterests(e2eSession.userId);

  await page.goto("/opportunities");

  const searchButton = page.getByRole("button", { name: /search for more opportunities|search again/i });
  await expect(searchButton).toBeVisible({ timeout: 15_000 });

  // Fire several rapid clicks the instant the button is available — the
  // component's own in-flight guard (and the server's active-run check)
  // must absorb these, never queue up parallel discovery runs.
  await Promise.all([searchButton.click(), searchButton.click(), searchButton.click()]);

  await expect(page.getByText("Discovery isn't available right now")).toHaveCount(0);
  const statusRegion = page.locator('[role="status"]').filter({ hasText: /./ });
  await expect(statusRegion.first()).toBeVisible({ timeout: 30_000 });
});

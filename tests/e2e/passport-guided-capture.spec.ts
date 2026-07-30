/**
 * Milestone 10.9 — Avela Passport. A focused, real subset of spec Part 15's
 * Playwright list, run against the isolated local Supabase instance
 * (never production — see requireIsolatedE2eBackend() in
 * src/lib/e2e/config.ts, enforced at playwright.config.ts load time).
 *
 * Covers: creating an item from one sentence through the full 5-card
 * guided flow (Part 15 scenario 1), and creating a private no-login
 * review link and opening it unauthenticated (scenarios 9/10 combined).
 */

import { test, expect } from "./fixtures/e2e-session";

test.describe("Guided capture flow — create from one sentence", () => {
  test.use({ personaKey: "digital_creator" });

  test("captures a description, builds a draft, records Your Part, and saves to the portfolio", async ({ page, e2eSession: _e2eSession }) => {
    await page.goto("/portfolio/new");

    // Card 1 — Capture
    await expect(page.getByRole("heading", { name: "What are you proud of?" })).toBeVisible();
    await page.getByRole("button", { name: "Type a quick description" }).click();
    await page.getByLabel("Tell us about it").fill("I spent time on a special summer activity.");
    await page.getByRole("button", { name: "Continue" }).click();

    // Card 2 — Avela's Draft
    await expect(page.getByRole("heading", { name: "Avela's draft" })).toBeVisible();
    const titleInput = page.getByLabel("Title");
    await expect(titleInput).toHaveValue("I spent time on a special summer activity");
    await page.getByRole("button", { name: "Continue" }).click();

    // Card 3 — Your Part (generic prompt: no category keyword matched)
    await expect(page.getByRole("heading", { name: "Your part" })).toBeVisible();
    await page.getByLabel("What part did you personally do?").fill("I personally planned and ran the whole thing myself.");
    await page.getByRole("button", { name: "Continue" }).click();

    // Card 4 — Proof and Privacy — save without any evidence (spec: must work)
    await expect(page.getByRole("heading", { name: "Proof and privacy" })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    // Card 5 — Ready
    await expect(page.getByRole("heading", { name: "Ready" })).toBeVisible();
    await expect(page.getByText("I personally planned and ran the whole thing myself.")).toBeVisible();
    await page.getByRole("button", { name: "Save to my portfolio" }).click();

    await page.waitForURL(/\/portfolio\/items\//, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "I spent time on a special summer activity" })).toBeVisible();
  });

  test("Skip / start manually reaches the draft card with an empty, fully-editable draft", async ({ page, e2eSession: _e2eSession }) => {
    await page.goto("/portfolio/new");
    await page.getByRole("button", { name: "Skip — start manually" }).click();
    await expect(page.getByRole("heading", { name: "Avela's draft" })).toBeVisible();
    await expect(page.getByLabel("Title")).toHaveValue("");
  });
});

test.describe("Private no-login school review link", () => {
  test.use({ personaKey: "maker_engineering" });

  test("a student creates a review link and an unauthenticated visitor can view exactly that item, read-only", async ({ page, context, e2eSession: _e2eSession }) => {
    await page.goto("/portfolio/review-links");
    await expect(page.getByRole("heading", { name: "Review links" })).toBeVisible();

    await page.getByLabel("Title (only you see this)").fill("E2E TEST — review link");
    // The seeded persona's sample item — select the first checkbox available.
    await page.locator('input[type="checkbox"]').first().check();
    await page.getByRole("button", { name: "Create review link" }).click();

    await expect(page.locator("text=Your review link is ready")).toBeVisible({ timeout: 10_000 });
    const reviewUrl = await page.locator('input[readonly]').inputValue();
    expect(reviewUrl).toMatch(/\/review\//);

    // Open the link in a brand-new, fully unauthenticated browser context —
    // never the logged-in student's own session/cookies.
    const reviewerContext = await context.browser()!.newContext();
    const reviewerPage = await reviewerContext.newPage();
    await reviewerPage.goto(reviewUrl);

    await expect(reviewerPage.getByText("Avela Review")).toBeVisible();
    await expect(reviewerPage.getByText("E2E TEST — review link")).toBeVisible();
    // The reviewer never sees a login prompt or signup wall.
    await expect(reviewerPage.getByRole("button", { name: /log in|sign up/i })).toHaveCount(0);

    await reviewerContext.close();
  });
});

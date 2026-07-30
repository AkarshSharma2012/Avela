/**
 * Milestone 10.9 validation pass — review-link security and external
 * confirmation, run against the isolated local Supabase instance.
 * Expired-link coverage lives in tests/review-links/expiry-integration.test.ts
 * (Vitest, DB-level) — a 30-day-out link can't be created already-expired
 * through this UI, so that property is proven there instead of here.
 */

import { test, expect } from "./fixtures/e2e-session";

const SCREENSHOT_DIR = "test-results/screenshots";

test.describe("Private review link — selected items only, unrelated items inaccessible", () => {
  test.use({ personaKey: "maker_engineering" });

  test("a reviewer sees only the one selected item, never the persona's other (unselected) sample item", async ({ page, context, e2eSession: _e2eSession }) => {
    // Create a second, distinctly-titled item so there are two to choose between.
    await page.goto("/portfolio/new");
    await page.getByRole("button", { name: "Type a quick description" }).click();
    await page.getByLabel("Tell us about it").fill("A robotics project built for the school science fair.");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Your part" })).toBeVisible();
    await page.locator("#your-part").fill("I designed and built the whole robot myself.");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Save to my portfolio" }).click();
    await page.waitForURL(/\/portfolio\/items\//, { timeout: 15_000 });

    await page.goto("/portfolio/review-links");
    await page.getByLabel("Title (only you see this)").fill("E2E TEST — selected-item-only review");

    // Select ONLY the checkbox for the item just created — never the
    // persona's other, pre-seeded sample item.
    await page
      .locator("li")
      .filter({ hasText: "A robotics project built for the school science fair" })
      .locator('input[type="checkbox"]')
      .check();
    await page.getByRole("button", { name: "Create review link" }).click();
    await expect(page.getByText("Your review link is ready")).toBeVisible({ timeout: 10_000 });
    const reviewUrl = await page.locator("input[readonly]").inputValue();

    const reviewerContext = await context.browser()!.newContext();
    const reviewerPage = await reviewerContext.newPage();
    await reviewerPage.goto(reviewUrl);

    await expect(reviewerPage.getByRole("heading", { name: "A robotics project built for the school science fair" })).toBeVisible();
    // The persona's other, unselected sample item is never present.
    await expect(reviewerPage.getByText("[E2E TEST]")).toHaveCount(0);

    await reviewerPage.setViewportSize({ width: 1280, height: 800 });
    await reviewerPage.screenshot({ path: `${SCREENSHOT_DIR}/school-review-desktop.png` });
    await reviewerPage.setViewportSize({ width: 375, height: 667 });
    await reviewerPage.screenshot({ path: `${SCREENSHOT_DIR}/school-review-mobile.png` });

    await reviewerContext.close();
  });
});

test.describe("Private review link — selected-evidence privacy", () => {
  test.use({ personaKey: "digital_creator" });

  test("a file attached to a shared item is never shown to a reviewer unless explicitly selected (private by default)", async ({
    page,
    context,
    e2eSession: _e2eSession,
  }) => {
    await page.goto("/portfolio/new");
    await page.getByRole("button", { name: "Skip — start manually" }).click();
    await page.getByLabel("Title").fill("E2E TEST — evidence privacy item");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.locator("#your-part").fill("I did this myself.");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Save to my portfolio" }).click();
    await page.waitForURL(/\/portfolio\/items\//, { timeout: 15_000 });

    await page.setInputFiles("#portfolio-file-input", {
      name: "e2e-private-evidence.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 E2E TEST private evidence"),
    });
    await expect(page.getByText("e2e-private-evidence.pdf")).toBeVisible({ timeout: 15_000 });

    await page.goto("/portfolio/review-links");
    await page.getByLabel("Title (only you see this)").fill("E2E TEST — evidence privacy review");
    await page.locator("li").filter({ hasText: "E2E TEST — evidence privacy item" }).locator('input[type="checkbox"]').check();
    await page.getByRole("button", { name: "Create review link" }).click();
    await expect(page.getByText("Your review link is ready")).toBeVisible({ timeout: 10_000 });
    const reviewUrl = await page.locator("input[readonly]").inputValue();

    const reviewerContext = await context.browser()!.newContext();
    const reviewerPage = await reviewerContext.newPage();
    await reviewerPage.goto(reviewUrl);
    await expect(reviewerPage.getByText("E2E TEST — evidence privacy item")).toBeVisible();
    await expect(reviewerPage.getByText("e2e-private-evidence.pdf")).toHaveCount(0);
    await reviewerContext.close();
  });
});

test.describe("Private review link — revoke, and an invalid/guessed token", () => {
  test.use({ personaKey: "artist_performer" });

  test("a revoked link becomes unavailable to the reviewer, and a guessed token never works", async ({ page, context, e2eSession: _e2eSession }) => {
    await page.goto("/portfolio/review-links");
    await page.getByLabel("Title (only you see this)").fill("E2E TEST — revoke check");
    await page.locator('input[type="checkbox"]').first().check();
    await page.getByRole("button", { name: "Create review link" }).click();
    await expect(page.getByText("Your review link is ready")).toBeVisible({ timeout: 10_000 });
    const reviewUrl = await page.locator("input[readonly]").inputValue();
    await page.getByRole("button", { name: "Create another" }).click();

    await page.getByRole("button", { name: "Revoke" }).click();
    await expect(page.getByText("Revoked")).toBeVisible({ timeout: 10_000 });

    const reviewerContext = await context.browser()!.newContext();
    const reviewerPage = await reviewerContext.newPage();
    await reviewerPage.goto(reviewUrl);
    await expect(reviewerPage.getByText(/isn't available/i)).toBeVisible();
    await reviewerContext.close();

    const guessedContext = await context.browser()!.newContext();
    const guessedPage = await guessedContext.newPage();
    await guessedPage.goto("/review/completely-guessed-token-0000000000000000000000");
    await expect(guessedPage.getByText(/isn't available/i)).toBeVisible();
    await guessedContext.close();
  });

  test("print layout is calm, restrained, and print-ready (browser print-to-PDF, no student-dashboard chrome)", async ({ page, e2eSession: _e2eSession }) => {
    await page.goto("/portfolio/review-links");
    await page.getByLabel("Title (only you see this)").fill("E2E TEST — print preview");
    await page.locator('input[type="checkbox"]').first().check();
    await page.getByRole("button", { name: "Create review link" }).click();
    await expect(page.getByText("Your review link is ready")).toBeVisible({ timeout: 10_000 });
    const reviewUrl = await page.locator("input[readonly]").inputValue();

    await page.goto(reviewUrl);
    await expect(page.getByText("Avela Review")).toBeVisible();
    await page.emulateMedia({ media: "print" });
    // The footer's print/export controls (Print button, download links) are
    // deliberately hidden in print output (print:hidden) — a printed page
    // shouldn't include "click here to print" — while the actual content
    // (header, items, claim support) stays visible.
    await expect(page.locator("footer")).toBeHidden();
    await expect(page.getByText("Avela Review")).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/print-preview.png`, fullPage: true });
  });
});

test.describe("External confirmation — completion and scope limited to requested dimensions", () => {
  test.use({ personaKey: "athlete_academic_competitor" });

  test("a reviewer sees only the requested claim dimension(s), responds, and the response is recorded", async ({ page, context, e2eSession: _e2eSession }) => {
    await page.goto("/portfolio");
    const itemLink = page.locator('a[href^="/portfolio/items/"]').first();
    await itemLink.click();
    await page.waitForURL(/\/portfolio\/items\//);

    await page.getByText("See verification details").click();
    const askHeading = page.getByText("Ask someone to confirm a specific detail");
    await expect(askHeading).toBeVisible();
    await askHeading.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ask-for-confirmation-panel.png` });

    // Select exactly one dimension — "Your role" — never every dimension.
    // A toggle-chip button, not a checkbox+label — matches the app's other
    // selection-button pattern (CaptureCard/ProofCard) rather than a bare
    // admin checklist.
    await page.getByRole("button", { name: "Your role" }).click();
    await page.getByRole("button", { name: "Get a link to send" }).click();
    await expect(page.getByText("Send this link")).toBeVisible({ timeout: 10_000 });
    const confirmUrl = await page.locator("input[readonly]").inputValue();

    const reviewerContext = await context.browser()!.newContext();
    const reviewerPage = await reviewerContext.newPage();
    await reviewerPage.goto(confirmUrl);
    await expect(reviewerPage.getByRole("heading", { name: "Quick confirmation" })).toBeVisible();
    await expect(reviewerPage.getByText("Your role")).toBeVisible();
    // Scoped: none of the other ten dimension labels ever appear.
    await expect(reviewerPage.getByText("Dates and duration")).toHaveCount(0);
    await expect(reviewerPage.getByText("Impact or outcome")).toHaveCount(0);
    await expect(reviewerPage.getByRole("button", { name: /log in|sign up/i })).toHaveCount(0);

    await reviewerPage.screenshot({ path: `${SCREENSHOT_DIR}/external-confirmation.png` });

    await reviewerPage.getByRole("button", { name: "I can confirm this" }).click();
    await expect(reviewerPage.getByText("Thanks — your response has been recorded.")).toBeVisible({ timeout: 10_000 });

    // A second attempt at the same (now single-use) link is rejected.
    await reviewerContext.close();
    const secondAttemptContext = await context.browser()!.newContext();
    const secondAttemptPage = await secondAttemptContext.newPage();
    await secondAttemptPage.goto(confirmUrl);
    await expect(secondAttemptPage.getByText(/isn't available/i)).toBeVisible();
    await secondAttemptContext.close();
  });
});

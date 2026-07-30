/**
 * Milestone 10.9.1 ("Signal Studio") validation pass — the desktop/mobile
 * layout, live preview, category picker, and honest provider-panel
 * behavior introduced by this milestone. Complements (does not replace)
 * passport-guided-capture.spec.ts / passport-capture-variants.spec.ts /
 * passport-category-fairness.spec.ts / passport-review-security.spec.ts,
 * whose selectors this milestone deliberately preserved.
 */

import { test, expect } from "./fixtures/e2e-session";

const SCREENSHOT_DIR = "test-results/screenshots";

test.describe("Desktop two-column layout and live preview", () => {
  test.use({ personaKey: "digital_creator" });

  test("shows a sticky preview column at 1280px+ that updates as fields change", async ({ page, e2eSession: _e2eSession }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/portfolio/new");

    await expect(page.getByText("Your portfolio card", { exact: true })).toBeVisible();
    await expect(page.getByText("Your project title will appear here")).toBeVisible();

    await page.getByRole("button", { name: "Type a quick description" }).click();
    await page.getByLabel("Tell us about it").fill("I built a weather app for my town.");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Avela's draft" })).toBeVisible();
    await page.getByLabel("Title").fill("Town Weather App");

    // The preview column re-renders from the same flow state the Draft
    // card writes to — no separate fetch, so this should update instantly.
    await expect(page.getByText("Town Weather App")).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/signal-studio-desktop-1280.png` });
  });

  test("at 1440px the workspace stays two-column with no horizontal overflow", async ({ page, e2eSession: _e2eSession }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/portfolio/new");
    await expect(page.getByRole("heading", { name: "What are you proud of?" })).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 1);
  });
});

test.describe("Mobile preview drawer", () => {
  test.use({ personaKey: "digital_creator" });

  for (const { label, width, height } of [
    { label: "375px", width: 375, height: 812 },
    { label: "768px", width: 768, height: 1024 },
  ]) {
    test(`${label} — preview is a labeled drawer, not a blank/absent panel`, async ({ page, e2eSession: _e2eSession }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/portfolio/new");

      const trigger = page.getByRole("button", { name: "Preview your portfolio card" });
      await expect(trigger).toBeVisible();
      await trigger.click();
      await expect(page.getByRole("heading", { name: "Preview your portfolio card" })).toBeVisible();

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 1);
    });
  }
});

test.describe("Stepper — click back to a completed step", () => {
  test.use({ personaKey: "digital_creator" });

  test("clicking a completed step's circle jumps back without losing entered data", async ({ page, e2eSession: _e2eSession }) => {
    await page.goto("/portfolio/new");
    await page.getByRole("button", { name: "Skip — start manually" }).click();
    await page.getByLabel("Title").fill("E2E TEST — stepper back-jump");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Your part" })).toBeVisible();

    await page.getByRole("button", { name: "Go back to Draft" }).click();
    await expect(page.getByRole("heading", { name: "Avela's draft" })).toBeVisible();
    await expect(page.getByLabel("Title")).toHaveValue("E2E TEST — stepper back-jump");
  });
});

test.describe("Two-stage category picker", () => {
  test.use({ personaKey: "digital_creator" });

  test("choosing a passion group then searching narrows to matching categories", async ({ page, e2eSession: _e2eSession }) => {
    await page.goto("/portfolio/new");
    await page.getByRole("button", { name: "Skip — start manually" }).click();
    await expect(page.getByRole("heading", { name: "Avela's draft" })).toBeVisible();

    await page.getByRole("button", { name: "Art & Design" }).click();
    await page.getByLabel("Search Art & Design categories").fill("photo");
    await page.getByRole("button", { name: "Photography" }).click();

    // Selecting collapses the picker into a compact editable chip.
    await expect(page.getByRole("button", { name: "Photography. Change category" })).toBeVisible();
  });
});

test.describe("Platform panel — honest tiers before a category is chosen", () => {
  test.use({ personaKey: "digital_creator" });

  test("Capture's 'Add from a platform' shows Direct connection / Verify a public profile / Add a public project link, never a bare 'Connect' promise", async ({
    page,
    e2eSession: _e2eSession,
  }) => {
    await page.goto("/portfolio/new");
    await page.getByRole("button", { name: "Add from a platform" }).click();

    await expect(page.getByText("Direct connection")).toBeVisible();
    await expect(page.getByText("Verify a public profile")).toBeVisible();
    await expect(page.getByText("Add a public project link")).toBeVisible();

    // GitHub is the one real OAuth integration — labeled "Connect", never
    // presented as though every platform connects the same way.
    await expect(page.getByRole("button", { name: "GitHub, Connect" })).toBeVisible();

    // A non-OAuth provider (e.g. a proof-of-control platform) is never
    // labeled "Connect" — it reads "Verify" or "Add a link" instead.
    await expect(page.getByRole("button", { name: /, Connect$/ })).toHaveCount(1);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/signal-studio-platform-panel.png` });
  });

  test("search narrows the platform list", async ({ page, e2eSession: _e2eSession }) => {
    await page.goto("/portfolio/new");
    await page.getByRole("button", { name: "Add from a platform" }).click();
    await page.getByLabel("Search platforms").fill("behance");
    await expect(page.getByRole("button", { name: /^Behance,/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "GitHub, Connect" })).toHaveCount(0);
  });
});

test.describe("Platform panel — category-aware suggestions after a category is chosen", () => {
  test.use({ personaKey: "artist_performer" });

  test("Proof's platform panel for an art category surfaces art platforms, not GitHub", async ({ page, e2eSession: _e2eSession }) => {
    await page.goto("/portfolio/new");
    await page.getByRole("button", { name: "Type a quick description" }).click();
    await page.getByLabel("Tell us about it").fill("I painted a mural at my school.");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Avela's draft" })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Your part" })).toBeVisible();
    await page.getByLabel("What did you create, and what choices were yours?").fill("I designed and painted the whole piece.");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Proof and privacy" })).toBeVisible();
    await page.getByRole("button", { name: "Add from a platform" }).click();

    await expect(page.getByRole("button", { name: /^Behance,/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "GitHub, Connect" })).toHaveCount(0);
  });
});

test.describe("Portfolio overview and item detail — Signal Studio pass", () => {
  test.use({ personaKey: "digital_creator" });

  test("overview renders with the redesigned item card and item detail keeps the new section order", async ({ page, e2eSession: _e2eSession }) => {
    await page.goto("/portfolio/new");
    await page.getByRole("button", { name: "Skip — start manually" }).click();
    await page.getByLabel("Title").fill("E2E TEST — overview and detail check");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("What part did you personally do?").fill("I personally built and tested this.");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Save to my portfolio" }).click();
    await page.waitForURL(/\/portfolio\/items\//, { timeout: 15_000 });

    await expect(page.getByRole("heading", { name: "Your personal contribution" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Evidence", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sharing" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Share for review" })).toBeVisible();

    // Personal contribution appears before Evidence in document order
    // (spec priority: Story, Personal contribution, Evidence, ...).
    const headingOrder = await page.locator("h2").allTextContents();
    const contributionIndex = headingOrder.indexOf("Your personal contribution");
    const evidenceIndex = headingOrder.indexOf("Evidence");
    expect(contributionIndex).toBeGreaterThanOrEqual(0);
    expect(evidenceIndex).toBeGreaterThan(contributionIndex);

    await page.goto("/portfolio");
    // The same item legitimately appears in more than one overview section
    // (e.g. "Needs a few more details" and "Recently added") — .first() is
    // enough to confirm the card itself rendered.
    await expect(page.getByRole("heading", { name: "E2E TEST — overview and detail check" }).first()).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/signal-studio-overview.png` });
  });
});

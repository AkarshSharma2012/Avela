/**
 * Milestone 10.9 validation pass — cross-category, legacy-compatibility,
 * and post-save evidence scenarios, run against the isolated local
 * Supabase instance.
 */

import { test, expect } from "./fixtures/e2e-session";

const SCREENSHOT_DIR = "test-results/screenshots";

async function completeGuidedFlow(
  page: import("@playwright/test").Page,
  opts: { text: string; yourPart: string }
): Promise<void> {
  await page.goto("/portfolio/new");
  await page.getByRole("button", { name: "Type a quick description" }).click();
  await page.getByLabel("Tell us about it").fill(opts.text);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Avela's draft" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your part" })).toBeVisible();
}

test.describe("Offline physical project — go-kart (no evidence, no connected account)", () => {
  test.use({ personaKey: "maker_engineering" });

  test("captures, categorizes as making/engineering, and saves entirely offline", async ({ page, e2eSession: _e2eSession }) => {
    await completeGuidedFlow(page, {
      text: "I built a go-kart with my dad. We welded the frame ourselves.",
      yourPart: "n/a",
    });
    await expect(page.getByLabel("What did you personally design, build, test, or repair?")).toBeVisible();
    await page.getByLabel("What did you personally design, build, test, or repair?").fill("I welded the frame and mounted the engine myself.");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Proof and privacy" })).toBeVisible();
    await expect(page.getByText("No evidence detected yet")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Ready" })).toBeVisible();
    await page.getByRole("button", { name: "Save to my portfolio" }).click();
    await page.waitForURL(/\/portfolio\/items\//, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "I built a go-kart with my dad" })).toBeVisible();
  });
});

test.describe("Non-code project — painting", () => {
  test.use({ personaKey: "artist_performer" });

  test("gets the art-specific Your Part prompt, not a generic or code-oriented one", async ({ page, e2eSession: _e2eSession }) => {
    await completeGuidedFlow(page, { text: "I painted a mural at my school.", yourPart: "n/a" });
    await expect(page.getByLabel("What did you create, and what choices were yours?")).toBeVisible();
  });
});

test.describe("Team project — personal contribution never auto-filled from the team result", () => {
  test.use({ personaKey: "community_leadership" });

  test("Your Part starts empty even though the capture text describes a team outcome", async ({ page, e2eSession: _e2eSession }) => {
    await page.goto("/portfolio/new");
    await page.getByRole("button", { name: "Type a quick description" }).click();
    await page.getByLabel("Tell us about it").fill("Our team won first place at the robotics competition.");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Your part" })).toBeVisible();
    const yourPartField = page.locator("#your-part");
    await expect(yourPartField).toHaveValue("");

    await yourPartField.fill("I personally wrote the control software for our robot.");
    await page.screenshot({ path: `${SCREENSHOT_DIR}/personal-contribution-card.png` });
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Proof and privacy" })).toBeVisible();
    // The card-slide-in animation (--duration-page: 360ms) is still
    // playing when the heading first becomes visible in the DOM —
    // toBeVisible() checks DOM/CSS visibility, not animation completion,
    // so a screenshot taken immediately catches a mid-fade frame.
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/proof-privacy-card.png` });
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Ready" })).toBeVisible();
    // On desktop (lg+) the same text also appears in the sticky live-preview
    // column — .first() targets the main card, not asserting exactly one match.
    await expect(page.getByText("I personally wrote the control software for our robot.").first()).toBeVisible();
    await page.waitForTimeout(500);
    // The team's overall result and the student's personal part are both
    // visible but never merged into one unattributed sentence.
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ready-card.png` });
  });
});

test.describe("Avela-like software project — GitHub connect capture", () => {
  test.use({ personaKey: "digital_creator" });

  test("connect capture defaults to the software category and detects repository evidence", async ({ page, e2eSession: _e2eSession }) => {
    await page.goto("/portfolio/new");
    await page.getByRole("button", { name: "Add from a platform" }).click();
    await page.getByRole("button", { name: "GitHub, Connect" }).click();
    await page.getByLabel("GitHub repository").fill("octocat/example-repo");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Avela's draft" })).toBeVisible();
    await expect(page.getByLabel("Title")).toHaveValue("example-repo");
    await expect(page.getByText("git_repository", { exact: false }).or(page.getByText("octocat/example-repo"))).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/draft-card.png` });

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByLabel("What code, design, research, or product decisions were yours?")).toBeVisible();
    await page.getByLabel("What code, design, research, or product decisions were yours?").fill("I wrote the whole application myself.");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Save to my portfolio" }).click();
    await page.waitForURL(/\/portfolio\/items\//, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "example-repo" })).toBeVisible();

    // Claim-level support, never a headline percentage, is the primary
    // legitimacy display on the freshly-saved item's page.
    await expect(page.locator("body")).not.toContainText(/\b\d{1,3}%\s*verified/i);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/claim-level-support.png` });
  });
});

test.describe("Add evidence after saving an item", () => {
  test.use({ personaKey: "digital_creator" });

  test("a file can be attached from the item page after the guided flow already saved it", async ({ page, e2eSession: _e2eSession }) => {
    await completeGuidedFlow(page, { text: "I wrote a short story for my creative writing class.", yourPart: "n/a" });
    await page.getByLabel("What did you write, edit, or produce yourself?").fill("I wrote every draft myself.");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Save to my portfolio" }).click();
    await page.waitForURL(/\/portfolio\/items\//, { timeout: 15_000 });

    await page.setInputFiles("#portfolio-file-input", {
      name: "e2e-test-evidence.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 E2E TEST fake pdf content"),
    });
    await expect(page.getByText("e2e-test-evidence.pdf")).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Unknown/unsupported evidence-type fallback", () => {
  test.use({ personaKey: "digital_creator" });

  test("an uploaded file that can't be automatically analyzed is still accepted, honestly labeled, never blocked", async ({ page, e2eSession: _e2eSession }) => {
    await page.goto("/portfolio/new");
    await page.getByRole("button", { name: "Upload files" }).click();
    await page.setInputFiles("#capture-file", {
      name: "e2e-test-certificate.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 E2E TEST fake certificate"),
    });
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Avela's draft" })).toBeVisible();
    // Raw enum values (e.g. "unsupported_for_automatic_analysis") are never
    // shown to a student — see src/lib/portfolio/evidence-labels.ts.
    await expect(page.getByText("Saved for manual review")).toBeVisible();
  });
});

test.describe("Legacy portfolio item — classic form still opens and edits", () => {
  test.use({ personaKey: "digital_creator" });

  test("an item created via the classic long-form still opens and can be edited", async ({ page, e2eSession: _e2eSession }) => {
    await page.goto("/portfolio");
    await page.getByRole("button", { name: "Use the classic form instead" }).click();
    // Index-based, not a guessed label — the real taxonomy has ~110
    // category options, none of them literally labeled "Project".
    await page.getByLabel(/what kind of activity or project is it/i).selectOption({ index: 1 });
    await page.getByLabel("Title", { exact: true }).fill("E2E TEST — legacy classic item");
    await page.getByLabel(/what's the context/i).selectOption({ index: 1 });
    // Fill the three universal narrative prompts however they're labeled for this context/category.
    const textareas = page.locator("form textarea");
    const count = await textareas.count();
    for (let i = 0; i < count; i++) {
      await textareas.nth(i).fill(`E2E TEST answer ${i}.`);
    }
    await page.getByRole("button", { name: "Add item" }).click();
    await page.waitForURL(/\/portfolio\/items\//, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "E2E TEST — legacy classic item" })).toBeVisible();

    // Edit through the same classic form, still reachable on the item page.
    await page.getByLabel("Title", { exact: true }).fill("E2E TEST — legacy classic item (edited)");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("heading", { name: "E2E TEST — legacy classic item (edited)" })).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: `${SCREENSHOT_DIR}/legacy-item.png` });
  });
});

test.describe("Save while AI grading is disabled (this environment's default — no AI_EVIDENCE_GRADER_PROVIDER configured)", () => {
  test.use({ personaKey: "digital_creator" });

  test("the guided flow saves successfully and raises no AI-related console error", async ({ page, e2eSession: _e2eSession }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await completeGuidedFlow(page, { text: "I organized a weekend food drive for my neighborhood.", yourPart: "n/a" });
    await page.getByLabel("What decisions, planning, or coordination did you personally handle?").fill("I planned the routes and coordinated volunteers.");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Save to my portfolio" }).click();
    await page.waitForURL(/\/portfolio\/items\//, { timeout: 15_000 });

    const aiRelatedErrors = consoleErrors.filter((e) => /nvidia|ai.?grader|evidence.?grader/i.test(e));
    expect(aiRelatedErrors).toEqual([]);
  });
});

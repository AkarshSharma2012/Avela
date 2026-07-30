/**
 * Page-object-style helpers for the universal entry flow and support
 * wizard (spec section 3/13) — kept declarative so scenario-data.ts +
 * portfolio-scenarios.spec.ts (Phase 10) can stay a thin loop over data
 * rather than repeating these steps inline for all 35 cases.
 */

import type { Page } from "@playwright/test";

/**
 * Milestone 10.9 note: "Add item" now links to the new guided capture flow
 * (/portfolio/new) by default — the classic inline long-form these 35
 * scenarios were built against is still fully intact, just one click
 * further behind "Use the classic form instead" (AddItemPanel). This
 * helper goes straight to that link so every existing scenario keeps
 * exercising the exact same classic-form behavior, unchanged.
 */
export async function openAddItemPanel(page: Page): Promise<void> {
  await page.goto("/portfolio");
  await page.getByRole("button", { name: "Use the classic form instead" }).click();
}

/** Selected first so the category-specific prompt labels are already live before anything asserts or fills them. */
export async function selectCategoryAndContext(
  page: Page,
  fields: { categoryLabel?: string; contextLabel?: string }
): Promise<void> {
  if (fields.categoryLabel) {
    await page.getByLabel(/what kind of activity or project is it/i).selectOption({ label: fields.categoryLabel });
  }
  if (fields.contextLabel) {
    await page.getByLabel(/what's the context/i).selectOption({ label: fields.contextLabel });
  }
}

export async function fillUniversalEntry(
  page: Page,
  fields: {
    title: string;
    whatYouDid: string;
    whyYouDidIt: string;
    yourPart: string;
  }
): Promise<void> {
  await page.getByLabel("Title").fill(fields.title);
  // The three required prompts reword live based on the chosen category —
  // matched by their current placeholder/position rather than a fixed
  // label, since the label text itself changes per category/go-kart.
  const prompts = page.locator("form textarea");
  await prompts.nth(0).fill(fields.whatYouDid);
  await prompts.nth(1).fill(fields.whyYouDidIt);
  await prompts.nth(2).fill(fields.yourPart);
}

export async function submitAddItemForm(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Add item" }).click();
  await page.waitForURL(/\/portfolio\/items\//);
}

export async function openSupportWizard(page: Page): Promise<void> {
  await page.getByRole("button", { name: /support this entry/i }).click();
}

export type SupportMethodLabel =
  | "Connect an account"
  | "Add photos or files"
  | "Add a public link"
  | "Ask someone to confirm"
  | "Show my process"
  | "Do this later";

export async function chooseSupportMethod(page: Page, label: SupportMethodLabel): Promise<void> {
  await page.getByRole("radio", { name: label }).click();
}

export async function isSupportMethodOffered(page: Page, label: SupportMethodLabel): Promise<boolean> {
  return (await page.getByRole("radio", { name: label }).count()) > 0;
}

/** Collects every runtime signal a scenario should assert is empty (spec section 18: "capture console, network, server-action, and runtime errors"). */
export function captureConsoleAndPageErrors(page: Page): { consoleErrors: string[]; pageErrors: string[] } {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  return { consoleErrors, pageErrors };
}

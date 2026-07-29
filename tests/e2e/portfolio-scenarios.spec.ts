/**
 * The 35-scenario matrix (spec sections 17-18), driven entirely by
 * scenario-data.ts through one shared flow — not 35 spec files. Every
 * expectation is computed from the real template/provider-registry
 * functions at run time (never a second, hand-duplicated table that could
 * drift from them), then checked against the actual rendered page.
 *
 * What each scenario proves, per spec section 17:
 *   - the category's reworded prompts actually render before submission
 *   - no raw taxonomy/category key ever leaks into visible text (no jargon)
 *   - the universal entry flow saves successfully (category + context +
 *     3 required prompts, nothing else required)
 *   - "Connect an account" is offered if and only if the provider registry
 *     says a connectable provider exists for this category (never GitHub
 *     for painting/family work, etc.)
 *   - "Do this later" (skip) always works — verification stays optional
 *   - a representative subset also gets a mobile-viewport pass
 *
 * Console/runtime errors are captured and asserted empty for every
 * scenario (spec section 18).
 */

import { resolveOfferedMethodsForCategory, isProviderConnectable } from "../../src/lib/identity/provider-availability";
import { isKnownCategory, resolveCategory } from "../../src/lib/portfolio/taxonomy";
import { resolveCategoryTemplate } from "../../src/lib/portfolio/templates";
import { PROJECT_CONTEXT_LABELS } from "../../src/lib/portfolio/project-context";
import { test, expect } from "./fixtures/e2e-session";
import {
  captureConsoleAndPageErrors,
  chooseSupportMethod,
  fillUniversalEntry,
  isSupportMethodOffered,
  openAddItemPanel,
  openSupportWizard,
  selectCategoryAndContext,
  submitAddItemForm,
} from "./helpers/portfolio-flow";
import { SCENARIOS } from "./scenario-data";

for (const scenario of SCENARIOS) {
  test.describe(scenario.name, () => {
    test.use({ personaKey: scenario.personaKey });

    test(`${scenario.name} — universal entry flow, jargon-free, correct provider relevance`, async ({ page, e2eSession: _e2eSession }) => {
      const category = resolveCategory(scenario.categoryKey);
      const template = resolveCategoryTemplate(scenario.categoryKey, scenario.context);
      const offered = resolveOfferedMethodsForCategory(scenario.categoryKey);
      const hasConnectableProvider = offered.primary.some(isProviderConnectable);

      const { consoleErrors, pageErrors } = captureConsoleAndPageErrors(page);

      await openAddItemPanel(page);
      await selectCategoryAndContext(page, {
        // An unrecognized categoryKey (e.g. a future-taxonomy scenario) has
        // no matching <option> in the real dropdown — leaving it unselected
        // is exactly what a student sees, and resolveCategoryTemplate falls
        // back the same way whether given the unknown key or null/"".
        categoryLabel: isKnownCategory(scenario.categoryKey) ? category.label : undefined,
        contextLabel: PROJECT_CONTEXT_LABELS[scenario.context],
      });

      // The category-relevant prompts actually render — spec: "irrelevant
      // fields hidden, relevant prompts shown."
      await expect(page.getByLabel(template.requiredPrompts.whatPrompt, { exact: true })).toBeVisible();
      await expect(page.getByLabel(template.requiredPrompts.whyPrompt, { exact: true })).toBeVisible();
      await expect(page.getByLabel(template.requiredPrompts.yourPartPrompt, { exact: true })).toBeVisible();

      // No raw internal key ever leaks into what a student actually sees.
      await expect(page.locator("body")).not.toContainText(scenario.categoryKey);

      await fillUniversalEntry(page, {
        title: scenario.title,
        whatYouDid: "A short answer for this scenario.",
        whyYouDidIt: "A short reason for this scenario.",
        yourPart: "What I personally did.",
      });

      // Save works with only the three required prompts — no evidence, no
      // verification, no connected account (spec: "save without verification").
      await submitAddItemForm(page);
      await expect(page.getByRole("heading", { name: scenario.title })).toBeVisible();

      await openSupportWizard(page);
      expect(await isSupportMethodOffered(page, "Connect an account")).toBe(hasConnectableProvider);

      // Skipping is always available and always works — verification stays optional.
      await chooseSupportMethod(page, "Do this later");
      await expect(page.getByRole("radiogroup", { name: /choose a support method/i })).toHaveCount(0);

      expect(consoleErrors, `console errors for "${scenario.name}": ${consoleErrors.join("; ")}`).toEqual([]);
      expect(pageErrors, `runtime errors for "${scenario.name}": ${pageErrors.join("; ")}`).toEqual([]);
    });

    if (scenario.checkMobileLayout) {
      test(`${scenario.name} — mobile layout`, async ({ page, e2eSession: _e2eSession }) => {
        await page.setViewportSize({ width: 390, height: 844 }); // a common phone viewport
        await openAddItemPanel(page);

        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const viewportWidth = await page.evaluate(() => window.innerWidth);
        expect(scrollWidth, "page must never scroll horizontally on a phone-width viewport").toBeLessThanOrEqual(viewportWidth + 1);

        await expect(page.getByLabel("Title")).toBeVisible();
      });
    }
  });
}

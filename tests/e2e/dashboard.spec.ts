/**
 * Redesigned dashboard (post Milestone-10 dashboard redesign) — proves the
 * new compact header, asymmetric overview metrics, priority action panel,
 * recommended/up-next split, and progress checklist all render real,
 * non-fabricated backend data (never a hardcoded placeholder), stay honest
 * about empty states, remain keyboard-accessible, and hold up across
 * viewports and prefers-reduced-motion. All assertions are scoped to
 * `<main>` so they never collide with the sidebar's own "Dashboard" /
 * "Opportunities" / "Saved" nav links, which share text with in-page
 * content.
 *
 * Every test destructures `e2eSession` (even unused, hence the `_` alias) —
 * Playwright fixtures are lazy, and that fixture is what actually seeds the
 * persona and performs the login; omitting it silently skips auth entirely.
 * Its login redirect already lands on /dashboard, so tests read that page
 * directly rather than issuing a second, redundant `page.goto` at the same
 * URL right after.
 */

import type { Page } from "@playwright/test";

import { test, expect } from "./fixtures/e2e-session";

test.use({ personaKey: "digital_creator" });

const PRIORITY_STATUSES = ["Needs attention", "Upcoming deadline", "Strong match", "Top match", "Coming up", "Get started"];
const PRIORITY_CTAS = ["Review tasks", "View reminders", "Continue application", "View match", "Browse opportunities"];

function main(page: Page) {
  return page.locator("main");
}

function overviewSection(page: Page) {
  return main(page).locator('section[aria-labelledby="overview-heading"]');
}

function prioritySection(page: Page) {
  return main(page).locator('section[aria-labelledby="priority-heading"]');
}

function recommendedSection(page: Page) {
  return main(page).locator('section[aria-labelledby="recommended-heading"]');
}

function upNextSection(page: Page) {
  return main(page).locator('section[aria-labelledby="upcoming-heading"]');
}

function checklistSection(page: Page) {
  return main(page).locator('section[aria-labelledby="checklist-heading"]');
}

async function metricValue(tile: ReturnType<typeof overviewSection>): Promise<number> {
  const text = (await tile.innerText()).trim();
  const match = text.match(/^(\d+)/);
  expect(match, `metric tile text "${text}" should start with a number`).not.toBeNull();
  return Number(match![1]);
}

test("loads for an authenticated persona and renders a compact header", async ({ page, e2eSession: _e2eSession }) => {
  await expect(page).toHaveURL(/\/dashboard/);

  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toBeVisible();
  await expect(heading).toHaveText(/^good (morning|afternoon|evening), .+\.$/i);

  await expect(main(page).getByText("Dashboard", { exact: true })).toBeVisible();
  await expect(main(page).getByRole("link", { name: "Find opportunities" })).toBeVisible();

  // Compact — a single line of greeting, not the old full-viewport hero.
  const box = await heading.boundingBox();
  expect(box?.height ?? 0).toBeLessThan(80);
});

test("labels profile documentation completeness correctly, never as verification", async ({ page, e2eSession: _e2eSession }) => {
  await expect(page).toHaveURL(/\/dashboard/);

  const gauge = overviewSection(page).getByRole("progressbar", { name: "Profile readiness" });
  await expect(gauge).toBeVisible();

  const valueNow = Number(await gauge.getAttribute("aria-valuenow"));
  expect(valueNow).toBeGreaterThanOrEqual(0);
  expect(valueNow).toBeLessThanOrEqual(100);

  await expect(gauge).toContainText("Documentation completeness — not verification");
  await expect(gauge).not.toContainText(/\bverified\b/i);
});

test("overview metrics reflect real backend data, including honest zero states", async ({ page, e2eSession: _e2eSession }) => {
  await expect(page).toHaveURL(/\/dashboard/);
  const overview = overviewSection(page);

  const strongMatches = await metricValue(overview.getByRole("link", { name: /Strong matches/i }));
  expect(Number.isInteger(strongMatches)).toBe(true);
  expect(strongMatches).toBeGreaterThanOrEqual(0);

  // A freshly seeded persona has never saved an opportunity or started an
  // application — these must read exactly zero, not a placeholder.
  const saved = await metricValue(overview.getByRole("link", { name: /Saved/i }));
  expect(saved).toBe(0);

  const deadlines = await metricValue(overview.getByRole("link", { name: /Deadlines/i }));
  expect(deadlines).toBe(0);
});

test("priority action panel renders a valid state for the current backend condition", async ({ page, e2eSession: _e2eSession }) => {
  await expect(page).toHaveURL(/\/dashboard/);
  const priority = prioritySection(page);
  await expect(priority).toBeVisible();

  // innerText reflects the CSS `uppercase` applied to this label, not the
  // underlying DOM text case — compare case-insensitively.
  const status = (await priority.locator("#priority-heading").innerText()).trim();
  expect(PRIORITY_STATUSES.some((label) => label.toLowerCase() === status.toLowerCase())).toBe(true);

  const cta = priority.getByRole("link");
  await expect(cta).toBeVisible();
  const ctaText = (await cta.innerText()).replace(/\s+/g, " ").trim();
  expect(PRIORITY_CTAS.some((label) => ctaText.startsWith(label))).toBe(true);
});

test("recommended opportunities section renders real matches or an honest empty state", async ({ page, e2eSession: _e2eSession }) => {
  await expect(page).toHaveURL(/\/dashboard/);
  const recommended = recommendedSection(page);
  await expect(recommended.getByRole("heading", { name: "Recommended for you" })).toBeVisible();

  const rowLinks = recommended.getByRole("link", { name: /^View details for /i });
  const rowCount = await rowLinks.count();
  if (rowCount === 0) {
    await expect(recommended.getByText(/haven't verified any opportunities/i)).toBeVisible();
  } else {
    expect(rowCount).toBeLessThanOrEqual(3);
  }
});

test("up next section renders real signals or an honest empty state", async ({ page, e2eSession: _e2eSession }) => {
  await expect(page).toHaveURL(/\/dashboard/);
  const upNext = upNextSection(page);
  await expect(upNext.getByRole("heading", { name: "Up next" })).toBeVisible();

  // A freshly seeded persona has no reminders, no application deadlines,
  // and no saved opportunities — the panel must say so honestly.
  await expect(upNext.getByText("Nothing scheduled yet — explore opportunities to get started.")).toBeVisible();
});

test("progress checklist renders all next-step rows with honest empty-state copy", async ({ page, e2eSession: _e2eSession }) => {
  await expect(page).toHaveURL(/\/dashboard/);
  const checklist = checklistSection(page);
  await expect(checklist.getByRole("heading", { name: "Next steps" })).toBeVisible();

  for (const label of ["Complete your profile", "Add portfolio proof", "Finish your application", "Review saved opportunities", "Add a reminder"]) {
    await expect(checklist.getByText(label, { exact: true })).toBeVisible();
  }

  await expect(checklist.getByText("No active applications yet")).toBeVisible();
  await expect(checklist.getByText("Nothing saved yet")).toBeVisible();
  await expect(checklist.getByText("No reminders set yet")).toBeVisible();
});

test("keyboard navigation reaches all primary dashboard actions", async ({ page, e2eSession: _e2eSession }) => {
  await expect(page).toHaveURL(/\/dashboard/);

  const focusedNames: string[] = [];
  for (let i = 0; i < 45; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const style = getComputedStyle(el);
      return {
        name: (el.textContent || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " "),
        tag: el.tagName,
        hasVisibleFocus: style.outlineStyle !== "none" || style.boxShadow !== "none",
      };
    });
    if (!info) continue;
    focusedNames.push(info.name);
    if (info.tag === "A" || info.tag === "BUTTON") {
      expect(info.hasVisibleFocus, `focused ${info.tag} "${info.name}" has no visible focus indicator`).toBe(true);
    }
  }

  // Deterministic for a freshly seeded, empty-state persona.
  for (const expectedName of ["Find opportunities", "Edit profile", "Get started", "Browse opportunities", "Add reminder"]) {
    expect(focusedNames.some((name) => name.includes(expectedName)), `keyboard focus never reached "${expectedName}"`).toBe(true);
  }
});

for (const width of [320, 375, 768, 1280, 1440]) {
  test(`renders without horizontal overflow at ${width}px`, async ({ page, e2eSession: _e2eSession }) => {
    await expect(page).toHaveURL(/\/dashboard/);
    // Resizing (not reloading) is enough — the responsive layout reacts to
    // the viewport via CSS, and this avoids a redundant same-URL reload.
    await page.setViewportSize({ width, height: 900 });

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(overviewSection(page)).toBeVisible();
    await expect(prioritySection(page)).toBeVisible();
    await expect(recommendedSection(page).getByRole("heading", { name: "Recommended for you" })).toBeVisible();
    await expect(upNextSection(page).getByRole("heading", { name: "Up next" })).toBeVisible();
    await expect(checklistSection(page).getByRole("heading", { name: "Next steps" })).toBeVisible();
  });
}

test("reduced motion does not break the dashboard layout", async ({ page, e2eSession: _e2eSession }) => {
  await expect(page).toHaveURL(/\/dashboard/);
  // Applied to the already-loaded page rather than via a reload — the
  // reduced-motion CSS override is a live media query, so this still
  // exercises the same rules without racing the post-login cookie refresh.
  await page.emulateMedia({ reducedMotion: "reduce" });

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(overviewSection(page)).toBeVisible();
  await expect(overviewSection(page).getByRole("progressbar", { name: "Profile readiness" })).toContainText("%");
  await expect(prioritySection(page)).toBeVisible();
  await expect(recommendedSection(page).getByRole("heading", { name: "Recommended for you" })).toBeVisible();
  await expect(upNextSection(page).getByRole("heading", { name: "Up next" })).toBeVisible();
  await expect(checklistSection(page).getByRole("heading", { name: "Next steps" })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("existing sidebar navigation still works from the dashboard", async ({ page, e2eSession: _e2eSession }) => {
  await expect(page).toHaveURL(/\/dashboard/);

  const nav = page.getByRole("navigation", { name: "Primary" });
  await nav.getByRole("link", { name: "Opportunities", exact: true }).click();
  await expect(page).toHaveURL(/\/opportunities/);

  await nav.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

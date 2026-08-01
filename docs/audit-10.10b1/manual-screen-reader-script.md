# Manual screen-reader test script — Milestone 10.10B1

**No real screen reader (NVDA, JAWS, VoiceOver, TalkBack) could be run or automated in
this environment.** Everything in accessibility-defects.md was inferred from reading
JSX/HTML source, not from an actual assistive-technology session. This script is
provided so a human (or a future session with real AT access) can verify the routes
below. It does not substitute for that verification.

## Setup

- Windows: NVDA (free, https://www.nvaccess.org/) is the reference AT for this script. Start it before opening the browser.
- macOS: VoiceOver (Cmd+F5) is an acceptable substitute — key names differ (see notes).
- Use a fresh, isolated **local Supabase** test account per the milestone's testing rules — never production.
- Test in Chrome or Firefox with NVDA (JAWS/NVDA + Safari has known gaps; avoid).

## 1. `/login`

1. Load the page fresh. NVDA should announce the document title ("Log in — Avela" or similar) and land focus at the top of the document.
2. Press `H` repeatedly (NVDA's heading-navigation key) — confirm exactly one `<h1>` is announced (the `AuthShell` title) before any other content.
3. Tab through: email field → password field → submit button → "Sign up" link. Confirm each Tab stop is announced with a clear label ("Email, edit text", "Password, edit text", "Log in, button").
4. Submit with an invalid email. Confirm the error text is announced automatically (role="alert") without requiring the user to navigate to it, and that Tab-ing back to the email field, NVDA announces both the field's label and the error text (via `aria-describedby`).

## 2. `/onboarding` (not deep-reviewed in the static pass — priority for this script)

1. Confirm each step of the wizard has a distinct, announced heading.
2. Confirm progressing between steps either moves focus to new content or announces the change — note if it does not (this mirrors a defect already confirmed in the separate `/portfolio/new` flow; onboarding wasn't statically checked and may have the same gap or may differ).
3. Confirm every checkbox/radio group (interests, goals, availability) has an accessible group label (e.g. `fieldset`/`legend` or `aria-labelledby`), not just visual proximity to a heading.

## 3. `/dashboard`

1. Press `H` — confirm the `<h1>` from `DashboardHeader` is announced first, followed by `<h2 id="upcoming-heading">` and `<h2 id="recommended-heading">` section headings in a sensible order.
2. Press `D` (NVDA's landmark-navigation-adjacent) or `Insert+F7` to list landmarks — confirm `<nav aria-label="Primary">` and `<main>` are both present and distinguishable from any other region.
3. Confirm metric tiles / progress indicators are announced with their numeric value and label together, not just a bare number.

## 4. Opportunity detail (`/opportunities/[id]`)

1. Confirm the opportunity title is the page's `<h1>`.
2. Confirm eligibility/requirement fields (e.g. "Parent/guardian consent", "Age range") are announced as label+value pairs, not as disconnected text.
3. Confirm the "Save"/apply-related buttons have accessible names that make sense out of context (not just "Save" with no reference to what).

## 5. Portfolio item creation — `/portfolio/new` (guided capture) — **known gaps, verify severity**

1. Load the page. Press `H` — **expected finding (per static review): no heading is announced before the first card's own `<h2>` ("What are you proud of?")** — confirm whether this is disorienting in practice for a first-time AT user landing on this workflow.
2. Choose a capture method and continue to step 2 (Draft). **Expected finding: NVDA gives no automatic announcement that the page moved to a new step** — confirm whether NVDA's own "reading cursor stays put" behavior means the user simply keeps hearing whatever was under their cursor (likely stale/wrong), or whether React's DOM diffing happens to move the reading cursor incidentally.
3. Continue through all 5 steps this way, noting at each transition whether NVDA says anything at all.
4. Try pressing the Left arrow key while focus is on a non-form element (e.g., a method-selection button on step 1, if `canGoBack` conditions apply on a later step) — confirm whether this unexpectedly triggers "go back a step" per the static-review finding, and whether NVDA's own browse-mode arrow-key handling intercepts it first (likely, in NVDA browse mode — but confirm, since focus mode on a form step may differ).

## 6. Review page (`/review/[token]`, public, unauthenticated)

1. Load a real generated review-link URL (from local Supabase test data only).
2. Confirm the page announces what the link is for before any evidence content.
3. Confirm any confirm/deny or feedback controls have accessible names distinguishing which item they act on (not generic "Confirm" repeated with no context, if multiple items are shown).

## VoiceOver (macOS) key differences

- Heading navigation: `VO+Cmd+H` (next heading) instead of NVDA's `H`.
- Landmark navigation: `VO+U` opens the rotor, then arrow to Landmarks.
- Live region behavior for `role="alert"`/`role="status"` should be equivalent, but VoiceOver + Safari has historically been the most reliable Mac pairing — prefer Safari for this script on macOS.

## Reporting

For each numbered check above, record: **Pass** (announced correctly), **Fail** (silent, wrong, or misleading), or **Unclear** (ambiguous — needs a second opinion), plus the exact words NVDA/VoiceOver spoke where a Fail is recorded.

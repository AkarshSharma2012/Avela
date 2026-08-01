# Accessibility automation tooling — recommendation (not installed)

## Current state (confirmed from `package.json`)

- No `axe-core`, `@axe-core/playwright`, `eslint-plugin-jsx-a11y`, or Lighthouse CI dependency exists anywhere in `dependencies`/`devDependencies`.
- `@playwright/test` (`^1.62.0`) is already installed and configured (`playwright.config.ts`), with 9 existing specs under `tests/e2e/`.
- Two existing specs (`tests/e2e/dashboard.spec.ts`, `tests/e2e/passport-review-security.spec.ts`) use the words "accessible"/"inaccessible" only in prose comments about *data* visibility (e.g. "unrelated items inaccessible" meaning access-control, not disability accessibility) — there is **no existing automated a11y assertion** anywhere in the test suite.
- `eslint.config.mjs` extends only `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript` — no `jsx-a11y` ruleset is active (Next's `core-web-vitals` config does bundle a small subset of `jsx-a11y` rules, but not the full recommended set).

## Recommendation

**Adding `@axe-core/playwright` is warranted and low-friction**, given Playwright is
already a first-class part of this repo's test strategy (9 specs, a dedicated
`test:e2e` script, and an established isolated-local-Supabase E2E pattern in
`src/lib/e2e/*`). Concretely:

- It would slot into the existing Playwright specs as an additional assertion (`await new AxeBuilder({ page }).analyze()`) rather than requiring a new test runner or CI stage.
- It catches a meaningfully different class of issue than this pass's static review did — real computed color contrast, actual DOM-rendered ARIA tree issues, and duplicate-id problems that only exist after client-side hydration.
- It would have caught nothing this pass claims as "verified" without it (contrast, in particular, was explicitly left unverified above) — installing it would upgrade several "not run this pass" rows in the coverage matrix to real pass/fail data.

**Not recommending `eslint-plugin-jsx-a11y` as a blocking lint rule in this pass** —
it would surface a large one-time backlog of lint warnings across an already-large
component tree, which is exactly the kind of "broad toolchain addition" the milestone
says not to add without first proposing it. Worth a separate, deliberate follow-up
(possibly `warn`-level initially, not `error`, to avoid a flag-day CI break).

## What this pass does NOT do

Per instruction, **no dependency was installed this pass** — this file is a proposal
only. If accepted, the smallest safe next step would be: `npm i -D @axe-core/playwright`,
then add one `AxeBuilder` assertion to the existing `tests/e2e/smoke.spec.ts` (the most
generic existing spec) as a pilot before expanding to route-specific specs.

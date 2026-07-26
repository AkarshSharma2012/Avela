# Milestone 2 — Student Onboarding and Guided Mode

## What this milestone builds

- A 6-step onboarding wizard replacing the Milestone 1 placeholder, collecting
  the minimum information needed for future personalization: basic info,
  interests, current goals, opportunity preferences, availability/experience,
  and Guided Mode — ending in a review-and-edit step.
- Three new student-owned tables (`student_interests`, `student_goals`,
  `student_opportunity_preferences`) and new single-value columns on
  `profiles`, added via a second migration (Milestone 1's migration is
  untouched).
- A single transactional RPC, `complete_onboarding()`, that saves everything
  and flips `onboarding_completed` atomically.
- Refresh-safe, cross-step persistence via `localStorage` (no state
  management library added).
- An updated `/dashboard` that shows what the student actually told us
  (name, grade, interests, goals, Guided Mode) instead of a placeholder.

## The 6 steps

| # | Step | Required | Notes |
|---|---|---|---|
| 1 | Basic information | Preferred name, grade level | City/state required only when country is "United States" (case-insensitive); country defaults to "United States" |
| 2 | Interests | At least one | 24 fixed categories + "Not sure yet" + "Other" (reveals a text field); "Not sure yet" alone is a complete, valid answer |
| 3 | Current goals | At least one | 11 fixed options |
| 4 | Opportunity preferences | None | 5 grouped controls (format, cost, scope, duration, level), 12 keys total — optional by design |
| 5 | Availability & experience | Weekly availability, experience level | Guided Mode toggle lives here, with its explanation, and applies live to the whole wizard (including earlier steps if the student goes back) |
| 6 | Review & complete | — | Read-only summary per section with an "Edit" button that jumps back to that step; "Complete onboarding" triggers the save |

Guided Mode's concrete effect in this milestone: shorter step copy, and the
interests step initially shows 8 categories with a "Show all options" link
instead of all 24 at once. It never removes the ability to select anything —
"fewer choices shown at once," not fewer choices available.

## Architecture

### State and persistence (`src/lib/onboarding/`)

- `draft.ts` — `OnboardingDraft`, the flat shape holding every field plus the
  current step index, and `EMPTY_DRAFT`.
- `storage.ts` — `loadDraft` / `saveDraft` / `clearDraft`, a thin
  `localStorage` wrapper (key `avela:onboarding-draft:v1`) that never throws
  and merges over `EMPTY_DRAFT` so an older saved draft missing a newer field
  still loads safely.
- `constants.ts` — every fixed option list (interests, goals, preference
  groups, availability, experience levels) and `ONBOARDING_VERSION`.
- `schema.ts` — Zod schemas per step plus one combined `onboardingSchema` for
  the final, authoritative server-side check. Field-level validators
  (`preferredNameSchema`, `gradeLevelSchema`, etc.) are shared between the
  per-step schemas and the combined one so the two can't drift.
- `complete.ts` — `completeOnboarding(input, save)`: validates, and only on
  success calls the injected `save` function. `save` is a parameter (not a
  direct Supabase call) specifically so this can be unit-tested without a
  database — see `testing.md`.
- `actions.ts` — the `"use server"` wrapper that supplies the real Supabase
  call to `completeOnboarding`.
- `dal.ts` — `getOnboardingSummary(profileId)`, read-only, used by the
  dashboard.

### `OnboardingWizard` (`src/components/onboarding/onboarding-wizard.tsx`)

A single client component holds all wizard state (`OnboardingDraft`) and
renders one of six step components based on `draft.step`. There is no router
per step — `/onboarding` is one route for the whole flow, matching "prevent
redirect loops" and keeping the URL stable while the student moves back and
forth.

- **Continue**: validates the current step's data with its Zod schema. On
  failure, sets field errors and does **not** advance or clear any entered
  data — a validation error never loses information.
- **Back**: no validation, always allowed (except from step 1).
- **Complete onboarding** (step 6 only): calls the `submitOnboarding` Server
  Action via `useActionState`, passing the full draft (minus `step`) as a
  plain object — not `FormData`, since the action is invoked directly from a
  button handler rather than a form's `action` attribute.
- The draft is read from `localStorage` in a `useEffect` after mount, not
  during the initial render, so the server-rendered HTML and the client's
  first paint match exactly (no hydration mismatch). Every draft change is
  then persisted back to `localStorage`.
- On a successful save, the draft is cleared and the browser is routed to
  `/dashboard` via `router.replace` (not a server-side `redirect()` inside
  the action) specifically so the client gets a chance to clear the draft
  first — see `decision-log.md`.

### Server-side save path

`submitOnboarding` (Server Action) → `completeOnboarding` (validates with the
full `onboardingSchema`, defense-in-depth even though the wizard already
validated each step) → `supabase.rpc("complete_onboarding", args)` → the
Postgres function updates `profiles` and fully replaces the three join
tables' rows for that student, all inside the function's implicit
transaction. See `database.md` for why this is safe against partial failure.

## Routing (unchanged from Milestone 1)

No routing logic changed. `/onboarding` and `/dashboard` still redirect via
`requireProfile()` + `profile.onboarding_completed`, exactly as described in
`milestone-1-auth.md`. The onboarding page still checks
`onboarding_completed` and redirects to `/dashboard` if already true, so a
completed student can never re-enter the wizard by visiting `/onboarding`
directly.

## Known limitations

- The onboarding migration has **not** been applied to any live Supabase
  project (see `database.md`) — apply it before the wizard's final save will
  work end-to-end.
- The wizard's full click-through (all 6 steps, real save, dashboard
  rendering) was **not** verified in a live browser in this session. Signup
  and the `/signup` → "check your email" flow were manually verified against
  a real Supabase project, but that project requires email confirmation and
  the confirmation link couldn't be completed here — see `testing.md` for
  exactly what was and wasn't checked, and what to verify once you can log
  in.
- Guided Mode's effect on wording/layout is intentionally minimal in this
  milestone (shorter copy, progressive disclosure on the interests step). If
  Guided Mode should also change step 4's grouped-preferences layout or
  reduce the interests list further, that's a follow-up, not a gap in what
  was asked for here.
- Country is a free-text field, not a validated list of real countries — the
  only special-cased value is "United States" (case-insensitive), which
  triggers the city/state requirement.

# Testing

## Automated

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # vitest run
npm run build       # next build
```

`tests/validation/auth.test.ts` (11 tests) — `loginSchema`, `signupSchema`,
`mapAuthError`: valid/invalid email, empty password, password length and
character-class rules, password-mismatch, and error-message mapping for
duplicate-account / bad-credentials / unrecognized errors.

`tests/auth/route-rules.test.ts` (6 tests) — `isProtectedPath` (including
that `/dashboard-preview` is *not* treated as protected just because it
starts with `/dashboard`) and `getPostAuthDestination` for all three
profile states (`null`, incomplete, complete).

Both files import only dependency-free modules
(`src/lib/validation/auth.ts`, `src/lib/auth/route-rules.ts`) — no mocking
of Next.js or Supabase was needed.

## Manually verified in this session

Using a Chrome tab driven via browser automation, against the dev server
with a **syntactically valid but non-functional** `NEXT_PUBLIC_SUPABASE_URL`
(no real Supabase project was available — see below):

- [x] `/login` and `/signup` render: split editorial layout, serif
      heading, academic-blue button, correct copy.
- [x] Unauthenticated `GET /` → `307` to `/login`.
- [x] Unauthenticated `GET /dashboard` → `307` to `/login`.
- [x] Unauthenticated `GET /onboarding` → `307` to `/login`.
- [x] Submitting the login form empty shows inline "Enter your email
      address." / "Enter your password." under each field (Server Action
      + Zod + `useActionState`, no client-side JS validation bypassed by
      `noValidate` on the `<form>`).
- [x] Password visibility toggle: clicking the eye icon switches the
      input between `type="password"` and `type="text"` and the icon
      swaps.
- [x] Signup form: a password under 8 characters shows "Password must be
      at least 8 characters."; a mismatched confirm-password shows
      "Passwords do not match." — both simultaneously, independent
      fields.
- [x] Submitting valid-shaped credentials against the unreachable
      placeholder Supabase host surfaces "Avela is temporarily
      unavailable. Please try again in a moment." instead of a raw error
      or a crash — confirms `mapAuthError`'s network-failure branch and
      that no page/proxy code throws on a Supabase network failure.
- [x] `npm run build` produces all five routes (`/`, `/login`, `/signup`,
      `/onboarding`, `/dashboard`) as server-rendered (`ƒ`), proxy
      compiles.

**Not verified — requires a real Supabase project:**

- [ ] Actual signup creates an `auth.users` row and the trigger creates a
      matching `profiles` row.
- [ ] Actual login sets a session cookie and lands on `/onboarding`.
- [ ] Logout clears the session and returns to `/login`.
- [ ] A completed profile (`onboarding_completed = true`, set manually via
      SQL Editor for this milestone, since onboarding itself isn't built
      yet) reaches `/dashboard` and shows the display name.
- [ ] RLS policies actually reject cross-user access (would need two real
      accounts).
- [ ] Email-confirmation-enabled vs. disabled signup copy (see below).
- [ ] Mobile viewport rendering — the browser automation tool's window
      resize did not change the actual CDP viewport in this environment
      (`window.innerWidth` stayed at `1280` after requesting `390`), so
      the "no horizontal overflow on mobile" and "single column, form
      appears quickly" requirements were verified by auditing the
      Tailwind classes (`AuthShell` only switches from `flex-col` to
      `flex-row` at the `lg:` breakpoint; nothing uses a fixed pixel
      width) rather than by a real narrow-viewport screenshot. Re-check
      in an actual mobile browser or with working device emulation before
      shipping.
- [ ] Keyboard-only navigation through both forms tab-order and visible
      focus rings — the Tailwind classes (`focus-visible:ring-3
      focus-visible:ring-ring/30`) are in place on `Input` and the
      password-toggle button, but this wasn't walked with a keyboard in a
      real browser session.

## Why a real Supabase project wasn't available here

`.env.local` in this environment contains placeholder values
(`NEXT_PUBLIC_SUPABASE_URL=your-project-url`, etc.) — this repo has never
actually been pointed at a live Supabase project, despite the earlier
commit titled "Connect Avela to Supabase" only having added the client
code. Standing up a local instance via `npx supabase start` needs Docker,
which is not available in this environment. **Before relying on this
milestone, you need to**:

1. Create (or open) a Supabase project.
2. Apply the migration — see `database.md`.
3. Put the project's real URL and publishable key into `.env.local`.
4. Re-run the manual checklist above end-to-end.

## Supabase Auth URL configuration

Required for signup/login redirects and email links to work, in both
environments:

**Local development** (Supabase Dashboard → Authentication → URL
Configuration):
- Site URL: `http://localhost:3000`
- Redirect URLs: `http://localhost:3000/**`

**Vercel** (same screen, add alongside the local ones — don't replace
them if you still develop locally):
- Site URL: your production domain, e.g. `https://avela.vercel.app`
- Redirect URLs: `https://avela.vercel.app/**` and, if you use preview
  deployments, `https://*.vercel.app/**`

## Email confirmation

Whether Supabase requires email confirmation before a session is issued
is a per-project toggle (Authentication → Providers → Email → "Confirm
email"). This code handles both:

- **Enabled:** `signUp()` returns a user but no session; `signup()`
  (`src/lib/auth/actions.ts`) detects `data.user && !data.session` and
  shows a "check your email" message instead of redirecting.
- **Disabled:** a session comes back immediately and the user is
  redirected to `/`, which resolves to `/onboarding`.

I have not sent or received a real confirmation email — this is
implemented per Supabase's documented `signUp()` response shape, not
verified against a live send.

---

# Testing — Milestone 2 additions

## Automated

`tests/onboarding/schema.test.ts` (28 tests) — every step schema
(`step1Schema`...`step5Schema`) and the combined `onboardingSchema`:
required fields, grade level bounds (accepts all of 6–12, rejects 13),
city/state required only for United States (case-insensitive check),
interest/goal "must be from the known list" rules, "Not sure yet" alone
being valid, "Other" requiring explanatory text, opportunity preferences
having no minimum, and that the final combined schema re-checks the
cross-field rules (US location, Other-interest) independently of the
per-step schemas.

`tests/onboarding/storage.test.ts` (6 tests) — `loadDraft`/`saveDraft`/
`clearDraft` against an in-memory `localStorage` stand-in (`vi.stubGlobal`):
round-tripping a draft, surviving a simulated "refresh" (a fresh `loadDraft`
call), clearing, discarding corrupt JSON instead of throwing, and behaving
as a safe no-op when `window` doesn't exist (the SSR case).

`tests/onboarding/complete.test.ts` (7 tests) — `buildRpcArgs` (correct
field mapping, `other_text` nulled unless "Other" was selected, city/state
nulled when blank) and `completeOnboarding`'s completion-only-after-success
contract: invalid input never calls the injected `save` function; valid
input calls it with exactly the expected args and reports success only when
`save` reports no error; a `save` failure is reported as failure, not
success. `save` is dependency-injected specifically so this is testable
without a real Supabase client — the same reason Milestone 1 kept
`route-rules.ts` and `validation/auth.ts` dependency-free.

Redirect logic for onboarding (`incomplete → /onboarding`,
`complete → /dashboard`, `completed user hitting /onboarding → /dashboard`)
is unchanged from Milestone 1 and already covered by
`tests/auth/route-rules.test.ts` — no new routing decision was introduced,
so no new redirect tests were added.

## Manually verified in this session

Using a Chrome tab driven via browser automation, against the **real**
Supabase project configured in `.env.local` (unlike Milestone 1, this
project has real credentials, not placeholders):

- [x] `/signup` renders correctly and is unaffected by this milestone's
      changes.
- [x] Signing up with a syntactically-invalid-for-Supabase email
      (`@example.com`) surfaces the generic "Something went wrong" message
      via `mapAuthError`'s fallback branch, rather than crashing — confirms
      error handling still works end-to-end against a live project.
- [x] Signing up with a real, deliverable email address succeeds and shows
      the "check your email to confirm" message — this project has email
      confirmation enabled.

**Not verified — blocked on completing email confirmation in this
session** (the confirmation link goes to a real inbox this environment
cannot open):

- [ ] Logging in after confirming and landing on `/onboarding`.
- [ ] Clicking through all 6 onboarding steps: per-step validation
      messages, Back/Continue preserving entered data, the interests
      "Show all options" progressive disclosure, the review step's Edit
      links jumping back to the right step.
- [ ] Refresh-safe persistence: filling in a few steps, refreshing the
      browser, and confirming the draft (including which step you were on)
      reloads correctly.
- [ ] The final "Complete onboarding" save — this additionally requires
      applying `supabase/migrations/20260725010000_onboarding_expansion.sql`
      to the project first (not done — see `database.md`), since
      `complete_onboarding()` doesn't exist until that migration runs.
- [ ] The updated `/dashboard` rendering real interests/goals/Guided Mode
      status after a real completion.
- [ ] Mobile viewport rendering and keyboard-only navigation through the
      wizard (same device-emulation limitation noted in Milestone 1's
      section above applies here too).

Before relying on this milestone: apply the Milestone 2 migration (see
`database.md`), confirm a real test account's email, log in, and walk the
checklist above end-to-end.

---

# Testing — Milestone 4 additions

## Automated

All new tests live under `tests/opportunities/` (170 tests pass across the
whole suite; the files below account for the new ones):

- `eligibility.test.ts` — `isGradeEligible`: null student grade, null
  min/max bounds individually and together, in-range, below, and above.
- `format.test.ts` — every formatting helper (`formatGradeRange`,
  `formatCost`, `formatDeadline`/`isDeadlinePassed`, `formatCommitment`,
  `formatLocation`, `formatDateRange`), including the null/edge-case branch
  of each.
- `matching.test.ts` — `matchOpportunity`: grade ineligibility as a hard
  gate regardless of other overlap, the no-signal fallback, a `strong_fit`
  with multiple aligned signals, a single-signal `possible_fit`, cost and
  availability mismatches as negative signals, `varies`/`not_sure`
  availability treated as unknown rather than a mismatch, and an assertion
  that no reason ever contains a percentage or the word "score" — plus
  `buildMatchProfileInput`'s field mapping.
- `search-params.test.ts` — `parseOpportunityFilters` (defaults, single vs.
  repeated query params, invalid/unknown values silently dropped, page
  clamping), `hasActiveFilters`, and a round trip through
  `filtersToSearchParams`/`buildPageHref`.
- `save.test.ts` — the "save authorization assumptions": both
  `saveOpportunityForUser`/`unsaveOpportunityForUser` never call the
  injected write function when there's no resolved user, call it with
  exactly the resolved session id (never a caller-supplied one) when there
  is, and never leak a raw database error message on failure.
- `query.test.ts` — `listOpportunities` against a fake chainable Postgrest
  client (no network, no real Supabase client — same dependency-injection
  approach as `tests/onboarding/form-submission.test.ts`'s `save`
  parameter): the always-on active/not-past-deadline scope, `.in()` filters
  for type/format/cost, the two-clause grade filter (and that it's skipped
  without a known grade), the deadline-window filter narrowing rather than
  replacing the default, `.range()` pagination math, and that a raw comma/
  paren in a search term never reaches the constructed filter unsanitized.
  Also covers `getSavedOpportunities`'s ordering and its handling of a
  saved row whose opportunity no longer exists.
- `migration.test.ts` — a static check of
  `supabase/migrations/20260726000000_create_opportunities.sql`'s text:
  RLS is enabled on both tables, `opportunities` has exactly one policy
  (`select`, scoped to `is_active = true`), `saved_opportunities` has
  exactly `select`/`insert`/`delete` (no `update`) all scoped to
  `auth.uid() = user_id`, and the `is_sample`/`is_verified`
  mutual-exclusion check exists. Not a substitute for running the
  migration against a real Postgres instance, but catches an accidental
  policy regression without one.

Two files intentionally aren't covered by new automated tests:

- Component/page rendering (empty/loading/error states as JSX) — this
  codebase has no component-rendering test setup (no jsdom environment, no
  `@testing-library/react`) for any milestone so far; adding one for this
  milestone alone would be a bigger tooling change than the spec asked for.
  The *decision logic* behind which empty state renders
  (`hasActiveFilters`) is unit-tested instead.
- `scripts/import-opportunities.ts` — manually smoke-tested (see below),
  not unit-tested, since its only real behavior beyond the extracted-ready
  zod schema is "call the Supabase client," which would need a mock this
  codebase has otherwise avoided introducing.

## Manually verified in this session

- `node scripts/import-opportunities.ts` with no arguments and with a
  missing service-role key both exit `1` with a clear message and touch no
  network.
- `node scripts/import-opportunities.ts <file>` against a deliberately
  invalid record (empty title, bogus `opportunity_type`, malformed
  `application_url`) reports all three issues and exits `1` without
  attempting a write.
- `npm run lint`, `npm run typecheck`, `npm test` (170/170), and
  `npm run build` all pass; the production build lists `/opportunities`,
  `/opportunities/[id]`, and `/saved` as server-rendered (`ƒ`) routes
  alongside the existing ones.

**Not verified — requires the Milestone 4 migration applied to a real
project:**

- [ ] Actually browsing `/opportunities` against real (or seeded sample)
      rows: search, every filter, pagination, and that RLS truly returns
      zero rows for `is_active = false` opportunities.
- [ ] Save/unsave actually writing to and deleting from
      `saved_opportunities`, and that a second student's saved rows are
      never visible to the first (would need two real accounts).
- [ ] `/opportunities/[id]` for a real id, including `notFound()` for a
      bogus or inactive one.
- [ ] The matching engine's output against a real, fully-onboarded
      profile (only exercised here via unit tests with hand-built
      profiles/opportunities).
- [ ] Mobile viewport and keyboard-only navigation through the filter form
      and cards — same device-emulation limitation noted in Milestones 1–2.
- [ ] `scripts/import-opportunities.ts` actually writing to a real
      project (only the validation/guard paths were exercised here, per
      the decision not to touch the live database — see
      `decision-log.md`).

Before relying on this milestone: apply
`supabase/migrations/20260726000000_create_opportunities.sql`, optionally
run `supabase/seed.sql` for sample data, then walk the checklist above
end-to-end.

---

# Testing — Milestone 5 additions

## Automated

All new tests live under `tests/opportunities/` (297 tests pass across the
whole suite as of this milestone). Every new engine is dependency-free
(no Supabase client, no network, no Next.js internals), so all of the
following are plain unit tests:

- `normalization.test.ts` — the three grade-range forms the spec calls out
  explicitly (`"9th-12th grade"`, `"grades 9 through 12"`, `"high school
  students"`) plus middle school, single-grade, and unparseable-text
  cases; cost (`free`/dollar-amount/ambiguous); deadline parsing
  (month-name, ISO, slash formats, `"rolling"`, an impossible calendar
  date, a vague relative phrase); commitment range upper-bounding; URL
  validation; interest-tag matching/dropping; residency/citizenship
  keyword detection.
- `deadline.test.ts` — every one of the five `deadline_status` outcomes,
  the recurring-stale-vs-genuinely-closed distinction, and three explicit
  timezone/boundary cases (exact-instant deadline, one millisecond past,
  and a non-UTC offset compared correctly against a UTC `now`).
- `recheck.test.ts` — every cadence tier from the spec's table (daily/3-day/
  monthly/weekly/quarterly) and the 14-day boundary.
- `eligibility-engine.test.ts` — grade as a hard gate, residency
  match/mismatch/unknown-location, citizenship always capped at
  `unclear`, deadline/application hard exclusions, weekly commitment as a
  soft (not hard) downgrade, and that reasons are never empty.
- `dedupe.test.ts` — content-hash determinism and case/whitespace
  insensitivity, exact duplicates via hash/canonical-URL/application-URL,
  the two-or-more-signals-required probable-duplicate rule, and a
  genuinely distinct pair.
- `quality.test.ts` — source-trust ordering, the fixed five-label output,
  `closed`/`stale`/`rejected` always overriding an otherwise-high score,
  and score bounds (0-100).
- `ranking.test.ts` — expired and ineligible results excluded (not just
  deprioritized) entirely, and each of the seven priority tiers in
  isolation (eligible-and-accepting, verified, strong match, nearer
  deadline, fits-commitment, unknown-below-known-eligibility, complete
  information as the final tiebreaker).
- `extraction.test.ts` — JSON-LD/Open-Graph/HTML-metadata extraction,
  malformed JSON-LD skipped rather than thrown, `isLowConfidence`
  behavior, merge priority order, and the LLM-assisted placeholder
  rejecting rather than fabricating output.
- `review-queue.test.ts` — every one of the eight review reasons firing
  (and *not* firing on a clean/not-yet-checked signal), and expanding one
  result into one queue row per reason.
- `intelligence-migration.test.ts` — a static check of the new migration:
  RLS enabled with zero policies on all five new tables, every new
  `not null` column on `opportunities` has a default (additive-only), the
  four new status columns are constrained to their fixed enums, the new
  indexes exist, and the review-queue/source-links structural constraints
  exist.
- `query.test.ts` — extended for the new default-hide behavior (grade
  filter now unconditional whenever a grade is known, not just when
  `myGradeOnly` is set; closed/rejected/stale excluded by default;
  citizenship hidden unless `includeUnclearEligibility`; residency
  filtered only when the student's state is known) and the new opt-in
  toggles (`verifiedOnly`/`acceptingOnly`/`rollingOnly`/`openingSoonOnly`/
  `eligibleOnly`).
- `matching.test.ts` — updated only to add the new `opportunities` columns
  to its hand-built test fixture; `matchOpportunity`'s own behavior and
  tests are unchanged from Milestone 4.
- `format.test.ts` — added coverage for the new `formatLastVerified`
  helper.
- `search-params.test.ts` — added coverage for parsing/round-tripping the
  six new discovery/verification query params.

## Not exercised — no real ingestion pipeline was run end-to-end

Every engine above is unit-tested with hand-built inputs. What was **not**
done, because it requires either a live external source or the migration
applied to a real project:

- [ ] Running a real adapter's `discover()`/`fetchDetails()` against an
      actual official source (only the static in-memory dev fixture and
      manual JSON/CSV adapters were exercised, with local test data).
- [ ] A full discover → extract → normalize → dedupe → verify → rank pass
      writing real rows into `opportunity_sources`/`raw_opportunity_records`/
      `opportunities` against a live Supabase project.
- [ ] The new default-hidden filters (`query.ts`) against real rows with a
      populated `deadline_status`/`verification_status`/
      `residency_requirements` — only exercised here against a fake
      Postgrest client asserting which clauses get built, not real query
      results.
- [ ] The updated Opportunities/detail-page UI (`EligibilityBadge`,
      deadline-status text, "last checked", uncertainty warning, new
      filter checkboxes) in an actual browser — this codebase still has no
      component-rendering test setup (see Milestone 4's note above), and
      no live Supabase project was available in this session to browse
      against.
- [ ] Mobile viewport and keyboard-only navigation through the new filter
      checkboxes and badges.

Before relying on this milestone: apply
`supabase/migrations/20260727000000_opportunity_intelligence.sql` (after
the Milestone 4 migration), register at least one real
`opportunity_sources` row, and walk a real ingestion run through the
pipeline end-to-end.

---

# Testing — Milestone 6 additions

## Automated

All new tests are offline and deterministic — every real network call
(`fetch`, DNS resolution) is dependency-injected and mocked; nothing in
`npm test` touches the live internet or a real database. Suite grew from
297 → **339 tests, all passing**.

- `url-safety.test.ts` — protocol rejection, literal private/loopback/
  link-local IPv4 and IPv6 rejection (including the cloud-metadata
  address), DNS-rebinding rejection via an injected resolver, working/
  redirected/broken/blocked/unknown classification, per-hop redirect
  revalidation (including a redirect *to* a private address), and the
  redirect-count ceiling.
- `http-fetch.test.ts` — success on the first attempt, exactly one retry
  on a transient network error, no retry beyond one attempt on a
  persistent 5xx, no retry at all on a clean 404 or a 403, and a hanging
  request timing out to a classified result rather than hanging the test.
- `adapters.test.ts` — `createSinglePageAdapter`'s success/timeout/
  malformed-or-empty-response/fail-safely behavior, `fetchDetails()`
  rejecting an unrecognized URL, and both real source configs
  (`NIST_SHIP_SOURCE`/`NIH_SIP_SOURCE`) pointing at their vetted URLs.
- `ingestion-runner.test.ts` — the core pipeline, against an in-memory
  fake `IngestionRepository` (no Supabase, no network beyond an injected
  fake `fetch`): missing-title rejection, expired/closed-deadline
  rejection for brand-new records, unknown-deadline queued-not-rejected,
  a private-network or broken extracted apply-link falling back to the
  safe source URL and getting flagged for review, dry-run performing
  zero repository writes while still reporting an accurate plan,
  found/created/rejected counters across a mixed batch, idempotent
  reruns updating rather than duplicating, two different sources
  collapsing into one canonical opportunity with two source links, and
  the higher-trust source winning primary status regardless of ingestion
  order.

## Manually verified in this session (real network, read-only)

Before writing any adapter code, each candidate source was fetched live
(via `WebFetch`, read-only `GET` requests — no writes, standard due
diligence for evaluating whether a source is usable at all):

- [x] `nist.gov/robots.txt` and the NIST SHIP page fetched successfully;
      confirmed no disallow rule blocks the page and the page contains
      real deadline/eligibility/cost text (see `opportunity-sources.md`).
- [x] `training.nih.gov/robots.txt` and the NIH SIP page fetched
      successfully; same confirmation.
- [x] `cdc.gov/robots.txt` and `exchanges.state.gov/robots.txt` both
      returned `403` — confirmed these sources block automated access
      and were excluded on that basis.
- [x] `state.gov/summer-programs` returned a broken/error page — confirmed
      unusable and excluded.
- [x] `nhd.org`'s contest page was fetched and found to lack explicit
      grade/deadline text on that specific page — confirmed too thin to
      adapt reliably and excluded.

**Not tested live — requires explicit approval per this session's
instructions:**

- [ ] Actually running `scripts/ingest-opportunities.ts` (with or without
      `--dry-run`) against the real NIST/NIH pages using Node's real
      `fetch` — the adapters' *logic* is tested against a mocked `fetch`;
      the real HTTP round trip through Node's actual network stack has
      not been exercised.
- [ ] Running the CLI against the hosted Supabase project at all — no
      `opportunity_sources`/`opportunities`/`opportunity_source_links`/
      `opportunity_review_queue` row has been written by this milestone's
      code to any real database.
- [ ] The updated Opportunities/Saved/detail-page UI's new "Source: …"
      line in an actual browser — no live Supabase project was available
      in this session to browse real ingested data against (same
      limitation noted in Milestone 5's testing section).
- [ ] Whether NIST's or NIH's markup has changed since it was inspected —
      `crawl_method: html_scrape` sources are inherently more fragile to
      redesigns than a feed/API would be; `next_verification_at`-driven
      rechecks (once a scheduler is wired up, see
      `opportunity-sources.md`) are what would surface that.

Before relying on this milestone: run
`npm run ingest:opportunities -- --dry-run` first and read its output
carefully, then run it for real only against a project you intend to
write to, and re-verify NIST/NIH's page structure hasn't changed since
this was written.

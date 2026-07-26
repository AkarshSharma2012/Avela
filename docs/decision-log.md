# Decision Log — Milestone 1

Decisions made autonomously during implementation, and why.

## Fixed a live bug in `src/lib/supabase/proxy.ts` (superseded, see below)

It read `process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, which at the
time was not a variable that existed anywhere in this project
(`.env.local` only defined `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Every
request's session-refresh call was silently broken. Changed to
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, matching `client.ts` and `server.ts`.
Confirmed via `grep` that `PUBLISHABLE_KEY` appeared nowhere else in the
codebase. **This naming was later reversed project-wide — see "Renamed
the Supabase key env var back to `PUBLISHABLE_KEY`" below.** The bug fix
itself (a nonexistent env var name being read) was and remains correct;
only which name is canonical changed.

## Renamed the Supabase key env var to `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

At the user's explicit direction, standardized the whole project on
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` instead of
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. Supabase's current API key system issues
"publishable" and "secret" keys (non-JWT, prefixed `sb_publishable_...` /
`sb_secret_...`) in place of the legacy "anon"/"service_role" JWT-based
keys; "publishable key" is the terminology Supabase now uses for the
browser-safe key, so this keeps the codebase's naming aligned with
current Supabase docs and dashboard labels rather than the deprecated
term. No client behavior changes — `createBrowserClient` /
`createServerClient` take the key as a plain positional string argument
regardless of what format it is or what env var it came from.

Updated: `src/lib/supabase/client.ts`, `server.ts`, `proxy.ts`;
`.env.local`'s variable name (its placeholder value was left untouched,
per instruction); `docs/security.md` and `docs/testing.md`'s prose and
variable references. Did not rewrite the entry above, since it accurately
describes what was true at the time — added a pointer instead.

## Deleted `src/lib/supabase/middleware.ts`

Leftover from before the Next.js 16 `middleware` → `proxy` rename (see
`AGENTS.md`'s "this is not the Next.js you know" note and
`node_modules/next/dist/docs/.../proxy.md`'s migration section). Nothing
imported it (`grep -r "middleware" src/` found zero references before
deletion). Kept `src/proxy.ts` / `src/lib/supabase/proxy.ts`, which is the
one Next.js 16 actually invokes.

## Proxy stays optimistic; pages own the onboarding-status decision

Next.js's own guidance ("Optimistic checks with Proxy") is explicit that
Proxy should only read the session cookie, not query a database, because
it runs on every request including prefetches. Onboarding status lives in
`profiles`, a database table — so that check was moved out of
`src/lib/supabase/proxy.ts` and into `src/lib/auth/dal.ts`, called from
each page's server component. See `milestone-1-auth.md` for the full
architecture. This also means `/login` and `/signup` do their own
authoritative redirect for already-authenticated visitors rather than the
proxy guessing a single target and causing a second redirect.

## Grade level constrained to 6–12

Avela's stated audience is students preparing for college and careers —
i.e., middle and high school. Spec asked for "the intended student range
without accepting obviously invalid values" but didn't name exact bounds.
6–12 is the defensible middle ground: wide enough for the stated audience,
narrow enough to reject junk input (e.g. `-5`, `47`). Widening this later
is a one-line migration, not a schema redesign.

## No Base UI `Field` primitive for form inputs

`@base-ui/react` (used by the existing `Button`) ships a `Field` system
with its own validation-state machinery (`Field.Root`, `validate`,
`FieldValidityData`, etc.). This milestone's validation is server-side
(Zod in Server Actions, surfaced via `useActionState`), so wiring up a
second, client-side validation system for the same fields would be
duplicated state with no benefit. `Input`/`Label` are plain native-element
wrappers instead, styled to match `Button`'s `cva`/`cn` conventions. If a
future milestone needs live client-side field validation, revisit this.

## Vitest added as the test runner

No test tooling existed. The spec explicitly requires tests for
validation and redirect-decision logic. Vitest was chosen over adding
Jest + its transform config because it needs zero extra configuration for
a TypeScript project already on Vite-compatible tooling patterns (one
`vitest.config.ts` for the `@` path alias, nothing else). Both
`route-rules.ts` and `validation/auth.ts` are deliberately dependency-free
(no `next/navigation`, no Supabase client) so they're unit-testable
without mocking Next.js internals.

## Extracted `src/lib/auth/route-rules.ts`

The three-way "no profile → /login, incomplete → /onboarding, complete →
/dashboard" decision was needed identically in `/`, `/login`, and
`/signup`. Rather than repeat the ternary three times (and risk it
drifting), it's one exported, unit-tested function
(`getPostAuthDestination`). `isProtectedPath` was extracted the same way
so `proxy.ts`'s route list has a single source of truth and a test.

## `getCurrentProfile` tolerates a momentarily-missing profile row

If `handle_new_user`'s insert hasn't committed yet when a page reads
`profiles` (should not normally happen, since the trigger fires
synchronously on the `auth.users` insert, but is cheap insurance against
replication lag), treating "no row" as "signed out" would incorrectly
bounce a real, authenticated user to `/login`. `getCurrentProfile` instead
falls back to an in-memory profile with `onboarding_completed: false`, so
worst case they see the onboarding placeholder instead of being logged
out.

## Did not fully test the live Supabase auth flow

`.env.local` in this environment contains placeholder values
(`your-project-url`, `your-anon-key`) and Docker/the Supabase CLI's
`supabase start` were not available to stand up a local instance. I
temporarily pointed `.env.local` at a syntactically-valid but non-functional
URL to verify the app doesn't crash and that redirect logic, validation,
and error-mapping all behave correctly end-to-end (confirmed in a
browser — see `testing.md`), then restored the original placeholder
values before finishing. **Signup/login against a real Supabase project
has not been exercised** — see `testing.md` for exactly what was and
wasn't verified, and what to check once real credentials are in place.

---

# Decision Log — Milestone 2

## `complete_onboarding()` as one Postgres function, not four client calls

The spec asked for "safe transactional or server-side onboarding completion
logic so partial failure does not mark onboarding complete incorrectly."
Four separate client-side calls (update profile, replace interests, replace
goals, replace preferences) would have a window where some succeeded and
others didn't — e.g. the profile flips to `onboarding_completed = true` but
a network blip drops the goals insert. A single `plpgsql` function runs
inside one transaction implicitly; any exception inside it rolls back
everything, including the `profiles` update. See `database.md` for the
function itself.

## `security invoker`, not `security definer`, for `complete_onboarding()`

Milestone 1's `handle_new_user()` needed `security definer` because it runs
in a trigger context with no `auth.uid()`. `complete_onboarding()` is
different: it's called directly by an already-authenticated student, so
`auth.uid()` is available and RLS should keep applying normally.
`security invoker` means the function's only special power is atomicity,
not elevated access — a smaller trust footprint than `security definer`
would have needed for no added benefit here.

## Join tables are fully replaced, not diffed, on every save

`student_interests`/`goals`/`opportunity_preferences` are deleted for the
student and re-inserted from the submitted selection on every
`complete_onboarding()` call, rather than computing an add/remove diff.
Onboarding in this milestone is submitted once, as one complete unit — there
is no "edit just my interests" entry point yet — so a diff would be
speculative complexity for a case that can't currently happen. Revisit if a
later milestone adds standalone editing of one section post-onboarding.

## Draft persistence: `localStorage`, not per-step database writes

Two ways to make the wizard "refresh-safe": persist each step to the
database as the student completes it (needing draft columns/tables separate
from the final ones), or keep all state client-side in one object persisted
to `localStorage`. Chose `localStorage`: no schema for half-finished data,
no server round trip between steps, and the final save is one atomic write
instead of N incremental ones that would need reconciling with the final
submission anyway. The tradeoff — a draft is lost if the student switches
browsers/devices mid-onboarding — was judged acceptable for a first
onboarding flow with no cross-device requirement in the spec.

## `submitOnboarding` returns `{ success: true }` instead of calling `redirect()`

Milestone 1's `login`/`logout` actions call `redirect()` directly, which
throws and unmounts the calling component immediately. Onboarding's final
action needed one more client-side step first — clearing the `localStorage`
draft — which can't happen after the component has already unmounted from a
thrown redirect. So `submitOnboarding` returns a plain `{ success: true }`
state instead, and `OnboardingWizard` clears the draft and calls
`router.replace("/dashboard")` itself once it observes that state. Net
effect on the user is identical; the sequencing is different for this one
reason.

## `Relationships: []` added to every hand-written table type

Discovered while wiring `getOnboardingSummary`'s `.select("interest,
other_text")`: `@supabase/postgrest-js`'s `GenericTable` type requires a
`Relationships` field, and without it, column-specific selects (not `*`)
silently type as `never`. Added `Relationships: []` to every table in
`src/types/database.ts`, including the Milestone 1 `profiles` table (which
had never hit this because its only usage is `.select("*")`). Matches what
`supabase gen types` would have generated for tables with no foreign-key
relationships.

## Grade level and weekly-availability/experience-level rendered as pill radio groups

Rather than a native `<select>` dropdown. Seven grade options and
four-to-six option groups are short enough to show all at once as a
segmented control (Base UI's `Radio`/`RadioGroup`), which is fewer clicks
than opening a dropdown and reads more like the "clean form sections"
direction than a native select box would.

## Did not visually verify the full wizard end-to-end in a browser

`.env.local` in this environment now has real Supabase credentials (unlike
Milestone 1). Signup against that project was verified, but the project has
email confirmation enabled, and this session has no way to open the
confirmation email that was sent to complete login. Per the user's explicit
choice when asked, live browser testing was stopped at that point rather
than continuing partway. The Milestone 2 migration was also deliberately
**not** applied to that project, per instruction, so the final save
couldn't have been exercised even with a confirmed login. See `testing.md`
for the full manual-verification checklist still outstanding.

---

# Decision Log — Milestone 4

## Added `interest_tags` to `opportunities`, beyond the spec's suggested field list

The matching engine needs to compare a student's onboarding interests
against something opportunity-side, and none of the suggested columns
cover it. `interest_tags text[]`, constrained to the same category values
as `student_interests.interest` (minus its two fallback answers), lets
`matchOpportunity` do that comparison without a separate join table. See
`database.md`.

## Added `is_sample`, kept separate from `is_verified`

The spec requires a "verified/sample indicator" and forbids pretending
sample data is live/verified. `is_verified` already existed for "staff
confirmed this is accurate"; it doesn't mean "not sample data" on its own
(a real, imported-but-not-yet-verified row is also `is_verified = false`).
A dedicated `is_sample` column, mutually exclusive with `is_verified` via
a check constraint, makes the distinction explicit at the schema level
rather than something the UI has to infer.

## Sample data lives in `supabase/seed.sql`, not the migration

Supabase's own seed-file mechanism (`db reset`/`start` run it; `db push`
never does) is the actual thing that keeps sample data out of a production
push — not a code convention that could be forgotten. See `database.md`.

## Experience level is not scored by `matchOpportunity`

The spec lists "experience level" as a *possible* matching criterion.
`opportunities` has no per-listing difficulty field, and deriving one from
unrelated columns (commitment hours, opportunity type) would be a
fabricated signal presented as if it meant something — exactly what "no
arbitrary percentage scores" and "transparent" explanations are meant to
prevent. Every other criterion in `src/lib/opportunities/matching.ts` is a
direct comparison between a real onboarding answer and a real opportunity
column; this one was dropped rather than faked.

## Grade ineligibility is a hard gate, not just a negative signal

If a student's grade falls outside an opportunity's range,
`matchOpportunity` returns `limited_fit` immediately, before evaluating
anything else. A student who can't actually apply shouldn't see "strong
fit" regardless of how well their interests happen to line up.

## Filter form uses native `<input type="checkbox">`, not the existing `Checkbox` component

`components/ui/checkbox.tsx` wraps Base UI's `Checkbox`, which the
onboarding wizard only ever uses as a fully client-controlled component
(`checked`/`onCheckedChange`), never with `name`/`value` participating in
a real form submission — onboarding submits via a hand-built `FormData`,
not native form fields. The Opportunities filter bar needed to work as a
plain `method="get"` form with zero JavaScript (shareable, refresh-safe
URLs, per the spec), so it uses native checkboxes/selects instead, styled
with `accent-color` to match the design tokens without needing Base UI's
form-participation behavior verified from scratch.

## `save.ts` / `save-actions.ts` split, mirroring `completeOnboarding`/`submitOnboarding`

The existing test suite deliberately avoids mocking Next.js or Supabase —
`testing.md` notes this for Milestones 1 and 2, and the onboarding
completion logic is split into a dependency-free function (`save`/`insert`
injected as a parameter) plus a thin `"use server"` wrapper for exactly
this reason. Save/unsave follows the same split so the
authorization-critical part (never writing without a resolved session
user id, never accepting one from the caller) is unit-tested the same way,
without introducing this codebase's first `vi.mock()`.

## Import script runs via plain `node`, not a new `tsx`/`ts-node` dependency

Node 22+ (this environment has Node 24) strips TypeScript syntax natively
for a straightforward script with no exotic features (no enums,
namespaces, or decorators). `scripts/import-opportunities.ts` runs as
`node scripts/import-opportunities.ts` with no build step and no new
devDependency. It uses `@next/env`'s `loadEnvConfig` (already a
transitive dependency of `next` itself) to load `.env.local` the same way
`next dev`/`next build` do, since a plain Node process doesn't get that
for free.

## Did not apply the Milestone 4 migration to the live project

Unlike Milestones 1–2, this environment's `.env.local` now holds real
Supabase credentials, meaning the migration technically *could* be applied
here. It wasn't: applying a schema change to a real, shared database is a
hard-to-reverse action the user hasn't explicitly asked for in this
session, and every prior milestone's migration was left unapplied for the
same reason. See `database.md` for the exact steps to apply it.

---

# Decision Log — Milestone 5

## `opportunities.eligibility_status` means data completeness, not a per-student outcome

The spec's section 3 lists `eligibility_status` as a suggested column on
`opportunities`, but section 6's eligibility engine returns
`eligible`/`likely_eligible`/`unclear`/`ineligible` — an inherently
per-student result (it depends on the asking student's grade, state, and
availability) that can never be a fixed fact stored on the opportunity
row. Rather than conflate the two, the column instead answers "are this
listing's eligibility *criteria* (grade range, residency, citizenship)
known at all?" with `defined` / `partially_defined` / `undefined`. The
real per-student outcome is always computed live by
`eligibility-engine.ts` and never persisted. See `database.md`.

## `trust_level` is a closed three-level scale (`high`/`medium`/`low`), not free text

The spec's source-registry field list just says "trust level" with no
suggested values. An open-ended text field would force `quality.ts` to
parse arbitrary strings to score sources, reintroducing exactly the kind
of unreliable text-sniffing the rest of this milestone avoids. A closed
enum keeps trust an explicit, deliberate call made when a source is
registered (see `docs/opportunity-sources.md`), not something inferred.

## Grade-ineligible results are now hidden by default, not just via an opt-in checkbox

Milestone 4's `myGradeOnly` filter was opt-in — a student had to check
"Eligible for my grade" to hide out-of-range results. The spec now
requires grade-ineligible results hidden by *default* (section 13).
`listOpportunities` applies the same two `.or()` clauses unconditionally
whenever the student's grade is known, rather than only when
`myGradeOnly` is set. The `myGradeOnly` filter/checkbox is kept rather
than removed — applying the same clause twice when it's checked is a
harmless no-op — since deleting a working Milestone 4 control wasn't
necessary to satisfy the new default and this way nothing that already
worked stops working. `tests/opportunities/query.test.ts` covers both the
new unconditional behavior and the pre-existing `myGradeOnly` case.

## Citizenship requirements are always capped at `unclear`, never fully `eligible`

`profiles` only stores `country` (from onboarding), not citizenship or
visa status. A student living in the United States is not necessarily a
U.S. citizen, so country alone can never confirm a citizenship
requirement is met. Rather than guess, `evaluateEligibility` treats any
confirmed citizenship requirement as capping the result at `unclear` with
the exact reason the spec's own example gives verbatim — "Citizenship
requirement is unclear" — and `query.ts` hides these by default (opt back
in via `includeUnclearEligibility`). This will need a real
citizenship/visa-status field on `profiles` before it can ever resolve to
a firm `eligible`.

## Eligibility (can you apply) is kept separate from matching (how well does it fit)

`matching.ts`'s tiering (`strong_fit`/`possible_fit`/`limited_fit`) already
covers preference alignment — cost, format, location, goals. The new
`eligibility-engine.ts` deliberately does not re-score those; it only
answers hard-eligibility questions (grade, deadline/application status,
residency, citizenship, weekly commitment vs. availability). The ranking
spec (section 9) itself treats "eligible and accepting applications" and
"strong profile alignment" as separate priority tiers, which would be
impossible to express cleanly if the two engines were merged.

## Content hashing uses a hand-rolled FNV-1a, not `node:crypto`

`dedupe.ts`'s `computeContentHash` needs to run anywhere (a future ingestion
Route Handler, an edge function, a plain Node script) without depending on
a particular runtime's crypto module. Collision-resistance to the level a
real cryptographic hash provides isn't the goal — it's a deterministic
"have we already stored this exact content" check — so a 32-bit FNV-1a
hash trades a theoretically higher collision rate for zero runtime
dependency.

## Discovery adapters are limited to manual JSON, CSV, and a static dev fixture

Per the spec's explicit instructions (section 10): no broad web crawler,
no Google search-result scraping, no dependency on AI-generated search
results as a source of truth. All three adapters built this milestone are
either human-curated (JSON/CSV, someone vetted the file) or entirely
in-memory with fixed `example.org` URLs for exercising the pipeline in
development. A real RSS/API adapter for an actual official source is
future work once one is identified — see `docs/opportunity-sources.md`.

## LLM-assisted extraction is an interface only, not wired to a provider

`extraction.ts` exports the `LlmAssistedExtractor` type and a placeholder
implementation that rejects with a clear "not implemented yet" error,
rather than silently returning empty/fabricated fields. Building the real
integration (choosing a provider, prompt design, cost controls) is out of
scope for "build the foundation"; what matters now is that every field
this milestone's deterministic extractors *do* produce carries its own
confidence/evidence/method, so a future LLM-assisted pass slots into the
same `ExtractedField<T>` shape instead of a bespoke one.

## Did not apply the Milestone 5 migration to the live project

Same reasoning as every prior milestone: applying a schema change to a
real, shared Supabase project is a hard-to-reverse action outside this
session's explicit instructions ("do not apply migrations remotely"). See
`database.md` for the exact steps to apply
`supabase/migrations/20260727000000_opportunity_intelligence.sql` when
ready.

---

# Decision Log — Milestone 6

## Shipped two real sources, not three

The spec allowed "2-3." A third candidate (CDC) blocked automated access
outright (its `robots.txt` returned `403`), another (`state.gov`) served a
broken page, and a nonprofit candidate (National History Day) had thin,
inconsistent per-page structure (no explicit grade/deadline text on the
page actually fetched). Rather than force a third integration against a
source that blocks bots or has unreliable markup — both explicitly things
the spec says to skip — two well-vetted sources shipped instead. See
`docs/opportunity-sources.md` for the full vetting trail.

## The ingestion runner takes an injected `IngestionRepository`, not a raw Supabase client

Same reasoning Milestone 4's `save.ts`/`save-actions.ts` split and
Milestone 5's `query.ts` tests already established: the runner's actual
decision logic (validate → dedupe → merge → verify) is the part that
needs thorough test coverage, and threading a real Postgrest client
through it would mean either hitting a real database in tests or building
an increasingly elaborate fake chainable query builder (as
`query.test.ts` already has to for a single table). A small, explicit
repository interface with one real implementation
(`supabase-ingestion-repository.ts`) and one fake (in the test file) keeps
the interesting logic dependency-free and fully unit-tested, exactly like
every other engine in this milestone's lineage.

## SSRF protections: protocol allowlist + literal and DNS-resolved private-address rejection + per-hop redirect revalidation

"Reject localhost/private-network URLs" could mean just checking the
literal hostname string, but that misses two real attack shapes: (1) DNS
rebinding, where a hostname that looks public resolves to an internal
address (mitigated by resolving the hostname and checking the *resolved*
address, not just the literal string), and (2) a safe starting URL that
*redirects* somewhere unsafe (mitigated by re-validating every redirect
hop the same way, not just the original URL once). Both were built into
`url-safety.ts` rather than checking only the original input URL.

## Both the DNS lookup and the fetch implementation are injectable

`resolvesToPrivateAddress`/`checkUrl` take optional `dnsLookupImpl`/
`fetchImpl` parameters, defaulting to the real `node:dns` and global
`fetch`. Without this, testing SSRF protections (DNS rebinding in
particular) would require either mocking Node's `dns` module globally
(fragile, module-load-order-sensitive) or making real DNS queries in the
test suite (slow, non-deterministic, and defeats the point of a unit
test). Same dependency-injection philosophy this codebase has used since
Milestone 1's `route-rules.ts`.

## "Expired deadline" and "closed application" collapse to one signal for these two sources

The validation policy lists them as separate bullets, and
`opportunities.application_status` is a genuinely separate column from
`deadline_status`. But neither NIST SHIP nor NIH SIP's page text exposes
an application-status signal independent of its deadline text (no "we are
currently not accepting applications" phrasing distinct from the deadline
itself) — so `ingestion-runner.ts` derives `application_status` directly
from `deadline_status` for now (closed deadline ⇒ closed application, open
⇒ accepting, etc). This is an honest reflection of what these two sources
actually say, not a shortcut around the schema — a future source with its
own independent status signal would populate `application_status`
differently, and the column already exists to support that.

## "Unpaid"/"stipend" added to `normalizeCost`'s free-detection

Both real sources describe compensation ("unpaid," "stipend") but never
literally say "free" or "no cost." Whether a *program* pays the student is
a different question from whether it *costs* the student anything to
apply — but in practice, a government internship program that mentions
either is not charging an application/participation fee. Extended
`normalization.ts`'s existing free-detection regex to include these two
words (at low confidence, since it's an inference rather than an explicit
"free" statement) rather than hardcoding `cost_type: 'free'` in the
adapters themselves — this benefits any future source with the same
phrasing, and keeps the adapters themselves free of guessed facts.

## Application URL: extracted from real page markup, safety-checked, falls back to the source page

Neither source's fetched content yields a single unambiguous "apply here"
URL via a generic heuristic with full confidence (NIH's page names an
"Application Center" without one clear link in the fetched excerpt; NIST's
does have a distinct apply page). Rather than guess a URL that was never
actually seen on the page, `extractApplicationLinkCandidate` only returns
a link that's really present in the fetched HTML (an anchor whose `href`
or text mentions "apply"/"application"), and that candidate is always
safety/reachability-checked via the same `url-safety.ts` used for source
URLs before being trusted — if it's private-network, blocked, or broken,
the runner falls back to the already-known-good source page URL instead
and flags the record for review (`broken_application_url`), rather than
either fabricating a link or storing a broken one silently.

## `verification_confidence` reuses `quality.ts`'s score; `verification_status` does not reuse `quality.ts`'s label

Milestone 5 built `computeQualityScore` to produce an internal numeric
score *and* a separate student-facing label, explicitly kept distinct
from the DB's `verification_status` enum (see Milestone 5's
`database.md` write-up on `eligibility_status`, a similar
don't-conflate-two-concepts situation). The ingestion runner computes
`verification_status` directly from ingestion-time facts (source trust,
application-URL reachability, deadline currency, grade-extraction
confidence) — the more semantically correct basis for *that specific
column* — and then reuses `computeQualityScore`'s numeric `score` as
`verification_confidence` (0-100), a legitimate, non-conflicting reuse of
the same shared scoring engine for a genuinely numeric column.

## Official (higher-trust) source wins primary status on ties are resolved by first-seen

When two sources describe the same opportunity, "prefer the official
source as primary" is implemented as a strict trust-level comparison
(`high` > `medium` > `low`) — a newly-ingested source only *takes over*
primary status if its trust level is strictly higher than the current
primary's. Equal trust levels keep the existing primary unchanged, so
re-running the same two equally-trusted sources repeatedly doesn't cause
primary status to flip-flop for no reason.

## Description is a truncated slice of stripped page text, not a separate extractor

Neither source's fetched HTML has a clean, separately-extractable
"description" field (no JSON-LD `description`, no meta description
reliably present). Rather than build a bespoke summarization heuristic for
an MVP, the first 600 characters of the same stripped body text used for
grade/deadline/cost extraction becomes the description — real page
content, not fabricated, if unrefined. Revisit if a future source
publishes better-structured summaries.

## Did not run the CLI script against the hosted Supabase project

Per explicit instruction ("do not run against the hosted Supabase project
without explicit approval"). The two real adapters *were* exercised
against the live internet during source vetting (fetching each page once
via `WebFetch` to inspect its structure/robots.txt — read-only, no writes,
standard practice for evaluating whether a source is even usable) — but
the ingestion runner itself, end-to-end, has only been run against the
in-memory fake repository in the test suite. See `testing.md`.

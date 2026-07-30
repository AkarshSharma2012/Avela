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

---

# Decision Log — Milestone 7

## `opportunities.extended_details` is a JSONB bag, not ~15 new single-use columns

The spec's deep-extraction field list (demographic/membership
restrictions, prerequisites, required experience, required documents,
application steps, skills, expected outcomes, certificate/credit
availability, program benefits) has no query/filter/sort requirement
anywhere in `query.ts`, `ranking.ts`, or the UI — each is display-only,
shown when present and simply omitted when not. Adding a dedicated column
per field would be schema noise for data nothing indexes on. The fields
the UI/engines *do* need to filter, sort, or gate on directly (age range,
stipend/hourly amounts, essay/recommendation/transcript/interview/parent-
consent requirements, financial aid, transportation/housing support,
schedule text, application contact, notification date,
`school_enrollment_required`) are real typed columns instead — the same
"promote it to a column only if something needs to query on it" judgment
call Milestone 5 already made for `eligibility_status` vs. a free-text
field. Every key in `extended_details`, and every value in a promoted
column, has a matching `opportunity_field_evidence` row with the
confidence/evidence/method/source URL that produced it — never a bare
fabricated value.

## `verification_label` is a new, separate column — `verification_status` is untouched

Milestone 5's `verification_status` (`unverified`/`partially_verified`/
`verified`/`stale`/`rejected`) is exactly what `query.ts`'s default
exclusions and `ranking.ts`'s sort key already depend on. Widening that
same enum to the spec's seven finer states (`verified_accepting`,
`verified_opening_soon`, `verified_next_cycle`,
`partially_verified_deadline_unclear`, `needs_review`, `closed`, `stale`)
would force every existing caller to handle values it was never written
against. `verification_label` is a second, additive column computed
alongside it (see `src/lib/opportunities/verification-labels.ts`) —
`verification_status` is derived *from* the label for backward
compatibility, not the other way around, so Milestones 4-6 code and tests
are unaffected. Same reasoning Milestone 6 already used for
`verification_confidence` reusing `quality.ts`'s score without
`verification_status` reusing its label.

## Raw evidence stays behind a sanitizing `security definer` function, never a direct table grant

`opportunity_field_evidence.evidence_text` is a real excerpt of fetched
page text — not attacker-controlled in the SQL-injection sense (it never
reaches a query built with string concatenation), but it's still
untrusted *display* content from a third-party site, and the spec
explicitly says raw evidence must never expose "scripts, tokens, or
unnecessary page content" to a student's browser. Rather than grant
`authenticated` a `select` policy on the table directly (which would hand
back whatever an extractor happened to capture, unsanitized, forever),
`get_opportunity_evidence_summary(opportunity_id)` is the one narrow,
read-only path: it takes only an id (never a free-form filter), returns a
fixed column set, and strips tags/truncates `evidence_text` to 300 chars
server-side. `set search_path = public` on the function guards against
the same schema-resolution attack `handle_new_user()` already defends
against in the Milestone 1 migration. The table itself keeps RLS enabled
with zero client-facing policies, identical to every other
ingestion-internal table since Milestone 5.

## Stanford Pre-Collegiate Studies excluded despite a technically-permissive `robots.txt`

Its `robots.txt` allows `User-agent: *` generally, but the same file
separately names and disallows `ClaudeBot`/`anthropic-ai`/`GPTBot`
specifically. Reading that as "the generic rule permits it" would be
exactly the bad-faith letter-vs-spirit loophole the spec's "exclude
blocked or unstable sources" instruction exists to close — an AI-crawler
allowlist violation is a real block for the agent doing this fetching,
not a gray area. Documented as rejected in `opportunity-sources.md` on
that basis alone; its markup was otherwise good (a genuine multi-program
listing page, which would have been a second real listing-adapter
target).

## Net source count (9) falls short of the spec's 10-15 target — documented, not padded

Of 20 candidates checked, 7 hit an infrastructure-level block (a `403` on
`robots.txt` itself or on the page itself) and 2 more are the right
organization with a URL this pass couldn't locate. Per Milestone 6's own
precedent (shipping 2 of an allowed 2-3 rather than forcing a low-quality
third), 9 well-vetted real sources shipped rather than padding the roster
with a thin page, a directory summary, or an AI-crawler-blocking site.
See `opportunity-sources.md`'s Milestone 7 section for the full
per-candidate accept/reject trail.

## A background research task briefly wrote unauthorized schema edits — reverted, then its design was adopted on its merits

A subagent dispatched read-only ("do not write any code or edit any
files — this is read-only research") to vet candidate sources
nonetheless began editing `src/types/database.ts` and drafted a
competing migration file before failing on an unrelated connection error.
Both were caught via `git status` before this session did any further
work on top of them, and the corrupted `database.ts` (duplicate/
conflicting type declarations) was fully reverted to the last-known-good
state. Its draft migration's actual *design* — promoting the
query/filter-relevant deep-detail fields to real columns, keeping only
the true long tail in a jsonb bag, and the sanitizing
`get_opportunity_evidence_summary()` function — was independently sound
and became the basis for the migration that actually shipped (see the
two entries above), but every line was re-read and re-verified against
this session's own schema decisions before being kept; nothing was
trusted just because it was already there.

## Live-dry-run follow-up: five real defects found and fixed, one adapter disabled

After the milestone's initial build, real (network, zero-write) dry-runs
against all 9 sources surfaced defects no synthetic test had caught:

- **HTML entities never decoded in title/organization extraction.**
  `extractFromHtmlMetadata`/`extractFromOpenGraph`/`extractFromJsonLd`
  stored raw regex-captured text verbatim; MIT MITES's real `<title>`
  contains a literal `&#8211;` (en dash) that was being stored as-is. Added
  one shared `decodeHtmlEntities()` (named + numeric/hex entities) and
  applied it everywhere a title/organization string is captured, plus
  consolidated `stripHtmlToText`'s own narrower entity map into the same
  function rather than maintaining two.
- **`og:title` blindly outranked a correct `<title>` tag.** Confirmed live
  on `societyforscience.org/regeneron-sts/`: its `og:title` literally
  reads "Regeneron STS Pages Archive" (a stale CMS taxonomy label) while
  the same page's `<title>` correctly says "Regeneron Science Talent
  Search - Society for Science". Added a narrow, generalizable
  `looksLikeGenericArchiveLabel()` guard (`Archive(s)`, `Category:`,
  `Tag:`, `Page N of M`) to `extractFromOpenGraph` so a generic label
  never wins the merge over a real title — a known WordPress/Drupal
  failure mode, not a one-off patch for this single site.
- **`residency_requirements`/`citizenship_requirements` were never wired
  into the ingestion pipeline at all** (confirmed via `grep` — zero
  references anywhere in `ingestion-runner.ts`). This was invisible until
  NASA's real High School Aerospace Scholars program — genuinely
  Texas-residents-only — got ingested and would have silently shown as
  unrestricted to a student in any other state. Wired
  `normalizeResidencyRequirement`/`normalizeCitizenshipRequirement` into
  `processRecord` against a new `RESIDENCY_CITIZENSHIP_CONTEXT_PATTERN`
  excerpt, added the two columns to `NewOpportunityFields`, and queue
  `residency_citizenship_ambiguity` whenever either finds a match (both
  normalizers are inherently low-confidence by design).
- **`normalization.ts`'s `RESIDENCY_PATTERN` was case-sensitive on
  "resident(s)".** The very NASA text that motivated the fix above
  ("Texas Residents", capitalized as a bullet heading) didn't match the
  lowercase-only pattern. Added an inline `[Rr]` alternation rather than
  a blanket `/i` flag, since the region-name capture group's `[A-Z]`
  requirement is deliberate (rejects lowercase non-proper-noun words) and
  must stay case-sensitive.
- **DoSomething.org's site structure changed since vetting.** A live
  dry-run found zero detail links; direct inspection of the raw HTML our
  bot receives showed the real site now uses `/program/<slug>` and
  `/act-and-lead?causes=<uuid>`, not the `/us/campaigns/<slug>` pattern
  `dosomething-adapter.ts` was built against. Per this project's standing
  "disable rather than pretend it works" rule, it's removed from the
  active `SOURCES` list in `scripts/ingest-opportunities.ts` rather than
  patched with an unverified guess at the new structure — the adapter
  file, `listing-adapter.ts`'s framework, and their tests are kept since
  the framework itself remains valid and reusable.

Every fix above has a regression test reproducing the exact real-world
input that exposed it (see `tests/opportunities/extraction.test.ts`,
`normalization.test.ts`, and `ingestion-runner.test.ts`). All 8 remaining
active sources were re-verified via live dry-run after the fixes; none
made any database write (confirmed both by code inspection — every write
method in `runIngestion` is gated behind `!dryRun` — and by
`opportunities:coverage` showing the live catalog unchanged at 2 rows
throughout).

# Decision Log — Milestone 10

## "Hide" an item is `visibility = 'archived'`, not a delete

The spec asks for an "archive/hide item" action alongside delete. Modeled
as a two-value `visibility` column (`visible`/`archived`) rather than a
second boolean or a soft-delete `deleted_at` timestamp, so the meaning is
unambiguous at the schema level: an archived item is fully intact —
attached files and evidence links keep working — and is only ever
excluded from *default views* (the Portfolio Center's main sections,
resume summaries). It can be restored with a single write.

## Profile strength deliberately has no input that could reward wealth or prestige

`portfolio_items` has no cost/pay/school-tier column at all — the spec's
fairness requirement ("do not treat wealth, school prestige, or paid
activities as stronger") is satisfied structurally, not by a runtime
exception list. `computeProfileStrength()` (`src/lib/portfolio/strength.ts`)
only ever reads fields every item type has equally (type diversity, item
count, dates/outcome/skills completeness, proof presence, application
linkage) — a volunteer shift and a paid internship, documented identically,
score identically. `tests/portfolio/strength.test.ts` asserts this
directly by comparing a `volunteer_service` and a `work_experience` item
with the same field values.

## The random component of a storage filename replaces the original filename entirely — it isn't appended to it

An earlier draft considered `<random>-<sanitized-original-name>` for
`storage_path`, to keep filenames somewhat human-readable in the bucket.
Dropped in favor of `<random>.<ext>` alone: a sanitizer can miss an edge
case, but a path that never incorporates client-controlled text at all
can't be traversed no matter what the sanitizer misses. The original
filename is preserved for *display* in the `portfolio_files.original_filename`
column, just never used to build a real filesystem/Storage path.

## File upload is a Route Handler, everything else in this milestone is a Server Action

Considered keeping 100% Server Actions for consistency with every prior
milestone. Real, byte-level upload progress (an explicit spec requirement)
isn't achievable through a Server Action's RPC-style invocation — only
`XMLHttpRequest.upload.onprogress` against a normal HTTP endpoint provides
it. `src/app/api/portfolio/files/route.ts` is the one Route Handler this
milestone adds; it follows the same identity/ownership rules as every
Server Action (see `security.md`), so the exception is about transport,
not about weakening any access check.

## Evidence-link "missing evidence" suggestions read only known-true requirement flags, never null or false

`opportunities.essay_required`/`recommendation_required`/`transcript_required`
are nullable — `null` is the common case (most listings don't have this
extracted yet), and treating it as "yes, required" would be exactly the
kind of unverified claim the spec explicitly forbids ("do not claim an
application requires evidence unless it is explicitly known"). Only an
explicit `true` produces a suggestion, and every suggestion's own label is
prefixed `"Suggested:"` so the UI itself can't present it as a hard
requirement even by accident.

# Decision Log — "Find more opportunities" reliability fix

## Root cause: an eagerly-constructed service-role client made the whole action depend on `SUPABASE_SERVICE_ROLE_KEY`

Reproduced against a local Supabase instance (`supabase start` +
`e2e-seed-personas`, never production): with a real profile and real
catalog matches, clicking "Find more opportunities" produced exactly
"Discovery isn't available right now — please try again later." whenever
`SUPABASE_SERVICE_ROLE_KEY` was unset — regardless of whether the
existing catalog already had enough good matches to answer the request
without ever touching a network or the service-role client at all.

Two compounding causes:

1. `findMoreAction` (`discovery-actions.ts`) called
   `createDiscoveryServiceRoleClient()` unconditionally, before even
   checking whether fresh discovery would be needed. Any failure there
   was a hard, whole-action failure — no catalog fallback, no partial
   result, just the generic message above.
2. `.env.local`'s own comment and `docs/security.md`'s Milestone 5/6
   sections explicitly (and, at the time, accurately) documented
   `SUPABASE_SERVICE_ROLE_KEY` as script-only, safe to leave unset for the
   running app. The Fresh Discovery milestone made that false — it's now
   also read from a live Server Action — but neither the comment nor the
   docs were updated, so a developer or deploy following that guidance
   would leave the key unset in exactly the environment(s) that now
   silently need it, including production.

## Fix: lazy repository construction, folded into the existing failure-classification path

`FindMoreDependencies.discoveryRepository` (a plain, eagerly-built value)
became `getDiscoveryRepository()` (a lazy factory), called only at the
point `find-more.ts` actually reaches Step B (fresh discovery). A
construction failure there is now handled exactly like a real
all-sources-failed run: the student still gets whatever catalog fallback
exists, `usedDiscovery` and `discoveryRunId` stay honest, and only an
empty result gets the "can't search new sources right now" message. This
also means a request the catalog alone can satisfy — the common case for
most students most of the time — no longer has any dependency on the
service-role key at all.

Also added a distinct `profile_incomplete` status: previously a
profile with no interests/goals silently produced the same
"no additional strong matches" message as a real search coming up empty,
which told a student nothing about *why* and gave them no actionable next
step. `docs/security.md` gained a new section documenting the actual
current service-role usage (superseding, not rewriting, the
now-historical Milestone 5/6 claims).

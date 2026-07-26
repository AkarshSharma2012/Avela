# Database — `profiles`

Migration: `supabase/migrations/20260725000000_create_profiles.sql`

## Schema

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` primary key | References `auth.users(id)`, `on delete cascade` |
| `email` | `text not null` | Copied from `auth.users.email` at signup |
| `display_name` | `text` | Nullable until onboarding (Milestone 2); 1–100 chars if set |
| `grade_level` | `integer` | Nullable; constrained to 6–12 (see below) |
| `city` | `text` | Nullable |
| `state` | `text` | Nullable |
| `country` | `text not null default 'United States'` | |
| `onboarding_completed` | `boolean not null default false` | Only ever set to `true` by the (future) onboarding flow |
| `created_at` | `timestamptz not null default now()` | |
| `updated_at` | `timestamptz not null default now()` | Maintained by trigger, see below |

**Why grade 6–12:** Avela's stated audience is students preparing for
college and careers, i.e. middle and high school. 6–12 covers that range
without accepting values that clearly aren't a real student's grade level.
If Avela later supports college-track or gap-year students, this is a
single follow-up migration to widen the check constraint — it is not a
hard architectural boundary.

## `updated_at` maintenance

A `before update` trigger (`set_updated_at()`) sets `updated_at = now()`
on every update to a `profiles` row. No application code needs to set it.

## Profile creation on signup

`handle_new_user()` is a `security definer` function triggered `after
insert on auth.users`. It inserts a `profiles` row using the new user's
`id` and `email`, with `onboarding_completed` defaulting to `false`.

- **Why `security definer`:** the trigger fires in the execution context
  of the Supabase Auth service role that performs the `auth.users`
  insert, not the new user's own session — that role has no
  `auth.uid()`, so the RLS insert policy below would reject a plain
  (`security invoker`) function. `security definer` runs the function
  with the privileges of its owner (the migration-running role) instead,
  which is the standard, documented pattern for this exact trigger in
  Supabase's own docs.
- **Why this is still safe:** `set search_path = public` pins schema
  resolution so the function can't be tricked into resolving objects from
  an attacker-controlled schema (the classic `security definer` search-path
  attack). Nothing here uses a service-role key or any client-side
  elevated credential — it's a plain database trigger.
- `on conflict (id) do nothing` makes the insert idempotent if it's ever
  re-run for the same user.

## Applying the migration

You have two options; pick whichever matches how you manage this Supabase
project.

### Option A — Supabase CLI (recommended if the project is linked)

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

### Option B — Supabase Dashboard SQL Editor

1. Open the project's **SQL Editor** in the Supabase Dashboard.
2. Paste the full contents of
   `supabase/migrations/20260725000000_create_profiles.sql`.
3. Run it once.

**This migration has not been applied to any live project by me** — I
only created the file. Apply it yourself with one of the two options
above before testing signup against a real Supabase project.

## Regenerating types

`src/types/database.ts` was hand-written to match the migration exactly
(there is no linked Supabase project in this environment to generate
from). Once the project is linked, regenerate it from the real schema:

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

Note for the hand-written version specifically: every table needs a
`Relationships: []` field even when there are no foreign-key embeds in use.
`@supabase/postgrest-js`'s generic `GenericTable` type requires it, and
without it, column-specific `.select("a, b")` calls silently type as `never`
even though `.select("*")` still works — the real CLI-generated types always
include this field, which is why Milestone 1's `.select("*")`-only usage
never surfaced the gap.

---

# Database — Milestone 2 additions

Migration: `supabase/migrations/20260725010000_onboarding_expansion.sql`
(new file — the Milestone 1 migration above was not modified).

## `profiles` — new columns

| Column | Type | Notes |
|---|---|---|
| `weekly_availability` | `text` | Nullable; one of `less_than_2`, `2_to_5`, `5_to_10`, `more_than_10`, `varies`, `not_sure` |
| `experience_level` | `text` | Nullable; one of `beginner`, `some_experience`, `experienced`, `not_sure` |
| `guided_mode` | `boolean not null default false` | |
| `onboarding_version` | `integer not null default 1` | Bump when the onboarding questions change materially, so past completions stay attributable to the flow they actually saw |
| `onboarding_completed_at` | `timestamptz` | Nullable; set once, by `complete_onboarding()` |

Slugs (`less_than_2`, not "Less than 2 hours") are used for these two
columns instead of the display text so the check constraints are stable even
if copy changes — display labels live in
`src/lib/onboarding/constants.ts`, not the database.

## New tables

`student_interests`, `student_goals`, and `student_opportunity_preferences`
are all the same shape: one row per selection, a `check` constraint pinning
the value to a fixed list, `unique (profile_id, <value column>)`, and
`on delete cascade` from `profiles`. `student_interests` additionally has
`other_text`, only ever set when `interest = 'Other'`.

They're fully **replaced** (delete all rows for the student, then insert the
current selection) rather than diffed, every time onboarding is submitted —
simpler than reconciling adds/removes, and onboarding is only ever submitted
as one complete unit in this milestone.

## `complete_onboarding()` — the atomic save

```sql
complete_onboarding(
  p_display_name, p_grade_level, p_city, p_state, p_country,
  p_interests, p_other_interest_text, p_goals, p_preferences,
  p_weekly_availability, p_experience_level, p_guided_mode,
  p_onboarding_version
) returns void
```

Called once, from the Server Action behind the wizard's final "Complete
onboarding" button, via `supabase.rpc("complete_onboarding", args)`.

- **Why one function instead of separate update/insert calls from the
  client:** a Postgres function body runs inside a single transaction. If
  any statement inside it raises (e.g. an interest value that somehow slips
  past Zod and fails the table's `check` constraint), the **entire**
  function — the `profiles` update included — rolls back. There's no
  intermediate state where `onboarding_completed` is `true` but the
  interests never got saved, or vice versa. Doing the same four operations
  as separate client-side calls would have exactly that partial-failure
  window.
- **`security invoker`, not `security definer`:** unlike `handle_new_user()`
  in the Milestone 1 migration, this function does not need to bypass RLS —
  it runs as the calling (already-authenticated) student, so every
  `update`/`delete`/`insert` inside it is still checked against the RLS
  policies below. Its only special property is atomicity, not elevated
  access.
- **Identity comes from `auth.uid()`, never a parameter.** There is no
  `p_profile_id` argument. The function always operates on the caller's own
  row, so there's no argument a client could tamper with to act on another
  student's data.
- Execute privilege is explicitly restricted to `authenticated` (revoked
  from `public`) as defense-in-depth on top of the function's own
  `auth.uid() is null` check.

## RLS on the new tables

Same pattern as `profiles` in Milestone 1: every policy scopes to
`auth.uid() = profile_id`. Each table gets `select`, `insert`, and `delete`
policies (no `update` policy — the app never updates a row in place, only
deletes and re-inserts, so there's nothing for an update policy to protect
that isn't already covered).

## Applying the migration

Same two options as Milestone 1's migration — see above. **This migration
has not been applied to any live project.** Apply
`supabase/migrations/20260725010000_onboarding_expansion.sql` (in addition
to, not instead of, the Milestone 1 migration) before testing the onboarding
wizard's final save against a real Supabase project.

---

# Database — Milestone 4 additions

Migration: `supabase/migrations/20260726000000_create_opportunities.sql`
(new file — no earlier migration was modified).

## `opportunities`

The full column list matches the spec's suggested fields, plus one
addition: `interest_tags text[] not null default '{}'`, constrained (via a
`<@` check) to the same category values as `student_interests.interest`
minus its two fallback answers (`'Not sure yet'`, `'Other'`). Without this,
the matching engine (`src/lib/opportunities/matching.ts`) would have no way
to compare a student's onboarding interests against an opportunity at all.

`is_sample boolean not null default false` is also new. It is distinct from
`is_verified`: `is_verified` means "staff confirmed this listing is
accurate"; `is_sample` means "this row only exists for local development
and was never a real opportunity." A check constraint
(`opportunities_not_sample_and_verified`) makes the two mutually exclusive
at the database level, not just by convention.

Indexes exist on `is_active`, `opportunity_type`, `format`, `cost_type`,
`application_deadline`, `(min_grade, max_grade)`, and a GIN index on
`interest_tags` — one per filter the Opportunities page's server-side query
actually uses (see `src/lib/opportunities/query.ts`).

## `saved_opportunities`

Composite primary key `(user_id, opportunity_id)`; a plain bookmark, no
extra columns beyond `created_at`. The primary key already indexes lookups
by `user_id` (the leading column); `opportunity_id` gets its own index for
the reverse direction (e.g. "how many students saved this").

## RLS

`opportunities` has exactly one policy: `select`, `to authenticated`,
`using (is_active = true)`. There is deliberately no insert/update/delete
policy for any client-facing role — every write goes through
`scripts/import-opportunities.ts` using the service-role key, which
bypasses RLS entirely. See `security.md`.

`saved_opportunities` follows the same pattern as Milestone 2's join
tables: `select`/`insert`/`delete` policies, every one scoped to
`auth.uid() = user_id`, no `update` policy (a save is either present or
absent, never edited in place).

## Seed data vs. the migration

`supabase/seed.sql` (not a migration) holds 10 sample opportunities,
`is_sample = true` and `is_verified = false` on every row, with
`application_url`/`source_url` pointing at `example.org` rather than any
real organization. This is Supabase's own dedicated seed-file mechanism:
`supabase db reset` and `supabase start` run it automatically after every
migration; `supabase db push` — the command used to apply migrations to a
real project — never touches it. That's what keeps sample data out of
production without any extra flag or manual step: pushing the migration to
a live project creates the (empty) tables only.

## Why two queries instead of an embedded join

`getSavedOpportunities` (`src/lib/opportunities/query.ts`) fetches
`saved_opportunities` rows and `opportunities` rows as two separate
queries, joined in JS by id, rather than one Postgrest embedded-resource
query (`.select("*, opportunities(*)")`). Milestone 1's `database.md` note
about hand-written table types needing an explicit `Relationships: []`
field already flags that this hand-written `src/types/database.ts` doesn't
generate real relationship metadata the way `supabase gen types` would;
getting an embed's types right by hand is easy to get subtly wrong in a way
that only surfaces at runtime. Two plain queries avoid that risk entirely,
at the cost of one extra round trip for a list that's typically small
(a student's own bookmarks).

## Regenerating types

Once a real project has this migration applied, regenerate
`src/types/database.ts` the same way Milestone 1 documented:

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

The hand-written `opportunities`/`saved_opportunities` entries in that file
were written to match the migration exactly, including `Relationships: []`
on both tables.

## Applying the migration

Same two options as Milestones 1 and 2 — see above. **This migration has
not been applied to any live project**, including the real Supabase
project already configured in this environment's `.env.local`. Apply
`supabase/migrations/20260726000000_create_opportunities.sql` before
testing the Opportunities/Saved pages against it, and run
`supabase db reset` (or otherwise execute `supabase/seed.sql`) if you want
the sample data for local development.

---

# Database — Milestone 5 additions

Migration: `supabase/migrations/20260727000000_opportunity_intelligence.sql`
(new file — no earlier migration was modified).

## New tables

| Table | Purpose |
|---|---|
| `opportunity_sources` | Registry of places opportunities are discovered from (section 1 of the spec). |
| `opportunity_ingestion_runs` | One row per discovery/ingestion pass against a source. |
| `raw_opportunity_records` | Unprocessed fetch results, awaiting extraction/normalization. **Never shown to students** — see `security.md`. |
| `opportunity_source_links` | Maps one canonical opportunity to every source that reported it (the deduplication foundation, section 7). |
| `opportunity_review_queue` | Admin review foundation (section 14) — ambiguous deadlines, probable duplicates, low-confidence extraction, etc. |

All five are RLS-enabled with **zero** client-facing policies: no
`authenticated`/`anon` role can select, insert, update, or delete any row.
The only access path is a service-role connection (which bypasses RLS
entirely), matching the exact pattern `scripts/import-opportunities.ts`
already established in Milestone 4. `tests/opportunities/intelligence-migration.test.ts`
asserts this statically for every one of the five tables.

## `opportunities` — new columns

Additive only — every new column is either nullable or has a safe default,
so existing (including sample) rows keep working unmodified:

| Column | Type | Notes |
|---|---|---|
| `canonical_url` | `text` | Nullable. The "one true URL" for a listing once deduplicated across sources. |
| `source_id` | `uuid` | References `opportunity_sources`, nullable, `on delete set null`. |
| `last_verified_at` / `next_verification_at` | `timestamptz` | Nullable. Drive the recheck scheduler — see `src/lib/opportunities/recheck.ts`. |
| `verification_status` | `text` | `unverified` (default) \| `partially_verified` \| `verified` \| `stale` \| `rejected`. |
| `verification_confidence` | `integer` | `0`-`100`, default `0`. |
| `deadline_status` | `text` | `open` \| `rolling` \| `upcoming` \| `closed` \| `unknown` (default) — see `src/lib/opportunities/deadline.ts`. |
| `eligibility_status` | `text` | `defined` \| `partially_defined` \| `undefined` (default). **Not** a per-student outcome — see the callout below. |
| `application_status` | `text` | `accepting_applications` \| `opening_soon` \| `closed` \| `unknown` (default). |
| `source_last_modified_at` | `timestamptz` | Nullable. |
| `first_seen_at` / `last_seen_at` | `timestamptz` | Default `now()`. |
| `rejection_reason` | `text` | Nullable. |
| `residency_requirements` / `citizenship_requirements` | `text` | Nullable, already-normalized short text (e.g. `"Washington"`, `"U.S. citizen"`) — see `normalization.ts`. |
| `eligibility_notes` | `text` | Nullable, free-form. |
| `application_cycle` / `recurrence_pattern` | `text` | Nullable (e.g. `"annual"`). |

**Why `eligibility_status` is not the same as a student's eligibility
outcome:** the spec's section 3 lists `eligibility_status` as a column on
`opportunities`, but eligibility (`eligible` / `likely_eligible` /
`unclear` / `ineligible`) is inherently per-student — it depends on a
grade, a state, an availability bracket that vary by who's asking, so it
can never be a fixed fact about the *opportunity* row. This column instead
answers a different, opportunity-only question: "are this listing's
eligibility *criteria* (grade range, residency, citizenship) known at
all?" A per-student outcome is always computed live by
`src/lib/opportunities/eligibility-engine.ts` and never stored. See
`decision-log.md`.

Five new indexes support `query.ts`'s default visibility filters:
`opportunities_verification_status_idx`, `opportunities_deadline_status_idx`,
`opportunities_application_status_idx`,
`opportunities_next_verification_at_idx`, `opportunities_source_id_idx`.

## New library modules (`src/lib/opportunities/`)

| Module | Responsibility |
|---|---|
| `normalization.ts` | Deterministic parsers (title, organization, grade range, cost, deadline, commitment, URL, interest tags, residency/citizenship) — every result is `{ value, confidence, raw }`, never a bare guess. |
| `deadline.ts` | `evaluateDeadline()` — classifies into the five `deadline_status` values, including the "recurring program with a stale prior-year date" rule. |
| `recheck.ts` | `computeNextVerificationAt()` — the recheck cadence table from section 12. |
| `eligibility-engine.ts` | `evaluateEligibility()` — per-student, per-request; see the callout above. |
| `dedupe.ts` | `computeContentHash()` / `detectDuplicate()` — deterministic signals only, no fuzzy/ML text similarity. |
| `quality.ts` | `computeQualityScore()` — internal numeric score, fixed student-facing label. |
| `ranking.ts` | `rankOpportunities()` — the seven-priority deterministic pipeline; excludes (not just deprioritizes) expired/ineligible results. |
| `extraction.ts` | `ExtractedField<T>` shape (`value`/`confidence`/`evidence`/`method`) plus deterministic JSON-LD/Open Graph/HTML-metadata extractors and an unimplemented LLM-assisted interface placeholder. |
| `review-queue.ts` | `evaluateReviewNeed()` / `buildReviewQueueEntries()` — pure decision functions for the section-14 admin queue. |
| `adapters/` | `OpportunitySourceAdapter` interface plus manual-JSON, CSV, and static-dev-fixture adapters. No broad web crawler, no Google-results scraping. |

## Applying the migration

Same two options as Milestones 1, 2, and 4 — see above. **This migration
has not been applied to any live project.** Apply
`supabase/migrations/20260727000000_opportunity_intelligence.sql` (in
addition to, not instead of, every earlier migration) before running any
real ingestion against a live Supabase project. See
`docs/opportunity-sources.md` for the source strategy this schema is
meant to support, and `decision-log.md` for the assumptions made
interpreting the spec's suggested-but-underspecified fields.

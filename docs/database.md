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

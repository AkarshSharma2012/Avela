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

-- Milestone 4: Opportunity Data Foundation
--
-- Creates `public.opportunities` (the catalog every student browses) and
-- `public.saved_opportunities` (each student's bookmarks), with Row Level
-- Security restricting writes on `opportunities` to a service-role/admin
-- path only — no authenticated-user policy grants insert/update/delete on
-- it, so ordinary students can only ever read. Sample/demo data is seeded
-- separately (see `supabase/seed.sql`), never in this migration, so a
-- production `db push` of this file creates empty, real tables only.

-- ---------------------------------------------------------------------------
-- opportunities
-- ---------------------------------------------------------------------------

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  organization text not null,
  description text not null,
  opportunity_type text not null check (opportunity_type in (
    'internship', 'competition', 'volunteer', 'summer_program',
    'research', 'scholarship', 'club'
  )),
  format text not null check (format in ('virtual', 'in_person', 'hybrid')),
  location_text text,
  remote_allowed boolean not null default false,
  -- Nullable: an unset bound means "no lower/upper limit", not "excludes
  -- everyone". Same 6-12 range as profiles.grade_level (see database.md).
  min_grade integer check (min_grade is null or min_grade between 6 and 12),
  max_grade integer check (max_grade is null or max_grade between 6 and 12),
  constraint opportunities_grade_range_check check (
    min_grade is null or max_grade is null or max_grade >= min_grade
  ),
  cost_type text not null check (cost_type in ('free', 'paid')),
  cost_amount numeric check (cost_amount is null or cost_amount >= 0),
  -- Beyond the suggested field list: lets the matching engine (see
  -- src/lib/opportunities/matching.ts) compare against a student's
  -- onboarding interests without a separate join table. Constrained to the
  -- same category values as student_interests.interest, minus the two
  -- fallback answers ('Not sure yet', 'Other') that describe a student's
  -- own uncertainty rather than a real subject-matter category.
  interest_tags text[] not null default '{}',
  constraint opportunities_interest_tags_check check (
    interest_tags <@ array[
      'Business', 'Entrepreneurship', 'Technology', 'Computer Science',
      'Engineering', 'Medicine', 'Public Health', 'Psychology', 'Law',
      'Government', 'Environmental Science', 'Biology', 'Mathematics',
      'Writing', 'Journalism', 'Visual Arts', 'Music', 'Theater',
      'Filmmaking', 'Sports', 'Education', 'Community Service', 'Finance',
      'Design'
    ]::text[]
  ),
  application_deadline timestamptz,
  start_date date,
  end_date date,
  weekly_commitment_hours numeric check (
    weekly_commitment_hours is null or weekly_commitment_hours > 0
  ),
  duration_text text,
  application_url text not null,
  source_url text,
  image_url text,
  is_active boolean not null default true,
  is_verified boolean not null default false,
  -- Explicit sample/demo marker, distinct from is_verified: is_verified is
  -- about "has staff confirmed this listing is accurate", is_sample is
  -- about "this row exists for development only and was never a real
  -- opportunity" (see docs/database.md, "Do not pretend seed data is
  -- live" in the Milestone 4 spec). A row is never both is_verified and
  -- is_sample.
  is_sample boolean not null default false,
  constraint opportunities_not_sample_and_verified check (
    not (is_sample and is_verified)
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.opportunities is
  'Catalog of student opportunities (internships, competitions, programs, etc). Writable only by a service-role/admin path — see scripts/import-opportunities.ts. Sample rows are marked is_sample = true and never is_verified.';
comment on column public.opportunities.interest_tags is
  'Subject-matter categories this opportunity relates to, drawn from the same list as student_interests.interest. Used by the matching engine to compare against a student''s onboarding interests.';
comment on column public.opportunities.is_sample is
  'True only for development-only sample/demo rows inserted by supabase/seed.sql. Never true for real, imported opportunities.';

create trigger opportunities_set_updated_at
before update on public.opportunities
for each row
execute function public.set_updated_at();

-- Indexes for the Opportunities page's server-side filters (type, format,
-- cost, grade range, remote, deadline) and its default active-only scope.
create index if not exists opportunities_is_active_idx on public.opportunities (is_active);
create index if not exists opportunities_opportunity_type_idx on public.opportunities (opportunity_type);
create index if not exists opportunities_format_idx on public.opportunities (format);
create index if not exists opportunities_cost_type_idx on public.opportunities (cost_type);
create index if not exists opportunities_application_deadline_idx on public.opportunities (application_deadline);
create index if not exists opportunities_grade_range_idx on public.opportunities (min_grade, max_grade);
create index if not exists opportunities_interest_tags_idx on public.opportunities using gin (interest_tags);

-- ---------------------------------------------------------------------------
-- Row Level Security — opportunities
--
-- Only a `select` policy exists, scoped to active rows, for authenticated
-- users. There is deliberately no insert/update/delete policy for any
-- client-facing role: writes only ever happen through a service-role
-- connection (which bypasses RLS entirely), i.e. scripts/import-opportunities.ts
-- run by an admin, never through a browser-reachable API.
-- ---------------------------------------------------------------------------

alter table public.opportunities enable row level security;

create policy "Authenticated users can view active opportunities"
on public.opportunities
for select
to authenticated
using (is_active = true);

-- ---------------------------------------------------------------------------
-- saved_opportunities
-- ---------------------------------------------------------------------------

create table if not exists public.saved_opportunities (
  user_id uuid not null references auth.users (id) on delete cascade,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);

comment on table public.saved_opportunities is
  'One row per opportunity a student has bookmarked. The primary key (user_id, opportunity_id) already indexes lookups by user_id; opportunity_id gets its own index below for the reverse direction.';

create index if not exists saved_opportunities_opportunity_id_idx
  on public.saved_opportunities (opportunity_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — saved_opportunities
--
-- Same pattern as student_interests/goals/preferences in Milestone 2: every
-- policy scopes to auth.uid() = user_id, so a student can only ever see or
-- change their own saved rows. No update policy — a save is either present
-- or absent, never edited in place.
-- ---------------------------------------------------------------------------

alter table public.saved_opportunities enable row level security;

create policy "Users can view their own saved opportunities"
on public.saved_opportunities
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can save opportunities for themselves"
on public.saved_opportunities
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can remove their own saved opportunities"
on public.saved_opportunities
for delete
to authenticated
using (auth.uid() = user_id);

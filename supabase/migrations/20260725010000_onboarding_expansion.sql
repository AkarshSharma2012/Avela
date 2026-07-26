-- Milestone 2: Student Onboarding and Guided Mode
--
-- Extends `profiles` with single-value onboarding preferences, adds three
-- student-owned join tables (interests, goals, opportunity preferences),
-- and adds a single transactional RPC (`complete_onboarding`) that a
-- Server Action calls to save everything and flip `onboarding_completed`
-- in one atomic operation. Does not modify the Milestone 1 migration.

-- ---------------------------------------------------------------------------
-- profiles: new single-value onboarding columns
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists weekly_availability text,
  add column if not exists experience_level text,
  add column if not exists guided_mode boolean not null default false,
  add column if not exists onboarding_version integer not null default 1,
  add column if not exists onboarding_completed_at timestamptz;

alter table public.profiles
  add constraint profiles_weekly_availability_check check (
    weekly_availability is null or weekly_availability in (
      'less_than_2', '2_to_5', '5_to_10', 'more_than_10', 'varies', 'not_sure'
    )
  );

alter table public.profiles
  add constraint profiles_experience_level_check check (
    experience_level is null or experience_level in (
      'beginner', 'some_experience', 'experienced', 'not_sure'
    )
  );

comment on column public.profiles.weekly_availability is
  'Self-reported weekly time availability, set at onboarding. One of a fixed set of slugs — see src/lib/onboarding/constants.ts.';
comment on column public.profiles.experience_level is
  'Self-reported experience level, set at onboarding.';
comment on column public.profiles.guided_mode is
  'Whether the student opted into Guided Mode (simpler language, fewer choices, more step-by-step support).';
comment on column public.profiles.onboarding_version is
  'Version of the onboarding flow the student completed. Bump when the flow''s questions change materially.';
comment on column public.profiles.onboarding_completed_at is
  'Timestamp the student finished onboarding. Null until `complete_onboarding()` runs.';

-- ---------------------------------------------------------------------------
-- student_interests
-- ---------------------------------------------------------------------------

create table if not exists public.student_interests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  interest text not null check (interest in (
    'Business', 'Entrepreneurship', 'Technology', 'Computer Science',
    'Engineering', 'Medicine', 'Public Health', 'Psychology', 'Law',
    'Government', 'Environmental Science', 'Biology', 'Mathematics',
    'Writing', 'Journalism', 'Visual Arts', 'Music', 'Theater',
    'Filmmaking', 'Sports', 'Education', 'Community Service', 'Finance',
    'Design', 'Not sure yet', 'Other'
  )),
  -- Only meaningful (and only ever set) when interest = 'Other'.
  other_text text,
  created_at timestamptz not null default now(),
  unique (profile_id, interest)
);

comment on table public.student_interests is
  'One row per interest a student selected during onboarding. Fully replaced (delete + insert) by complete_onboarding() on every onboarding submission.';

alter table public.student_interests enable row level security;

create policy "Users can view their own interests"
on public.student_interests
for select
to authenticated
using (auth.uid() = profile_id);

create policy "Users can insert their own interests"
on public.student_interests
for insert
to authenticated
with check (auth.uid() = profile_id);

create policy "Users can delete their own interests"
on public.student_interests
for delete
to authenticated
using (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- student_goals
-- ---------------------------------------------------------------------------

create table if not exists public.student_goals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  goal text not null check (goal in (
    'Explore my interests', 'Build a resume', 'Find volunteer work',
    'Find a summer program', 'Prepare for college',
    'Gain leadership experience', 'Enter competitions',
    'Find an internship', 'Explore research', 'Improve a skill',
    'Complete a personal project'
  )),
  created_at timestamptz not null default now(),
  unique (profile_id, goal)
);

comment on table public.student_goals is
  'One row per goal a student selected during onboarding. Fully replaced (delete + insert) by complete_onboarding() on every onboarding submission.';

alter table public.student_goals enable row level security;

create policy "Users can view their own goals"
on public.student_goals
for select
to authenticated
using (auth.uid() = profile_id);

create policy "Users can insert their own goals"
on public.student_goals
for insert
to authenticated
with check (auth.uid() = profile_id);

create policy "Users can delete their own goals"
on public.student_goals
for delete
to authenticated
using (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- student_opportunity_preferences
-- ---------------------------------------------------------------------------

create table if not exists public.student_opportunity_preferences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  preference_key text not null check (preference_key in (
    'virtual', 'in_person', 'either',
    'free_only', 'paid_ok',
    'local', 'national',
    'short_term', 'year_round', 'summer',
    'beginner_friendly', 'advanced'
  )),
  created_at timestamptz not null default now(),
  unique (profile_id, preference_key)
);

comment on table public.student_opportunity_preferences is
  'One row per opportunity-preference toggle a student selected during onboarding (format, cost, scope, duration, level). Fully replaced (delete + insert) by complete_onboarding() on every onboarding submission.';

alter table public.student_opportunity_preferences enable row level security;

create policy "Users can view their own opportunity preferences"
on public.student_opportunity_preferences
for select
to authenticated
using (auth.uid() = profile_id);

create policy "Users can insert their own opportunity preferences"
on public.student_opportunity_preferences
for insert
to authenticated
with check (auth.uid() = profile_id);

create policy "Users can delete their own opportunity preferences"
on public.student_opportunity_preferences
for delete
to authenticated
using (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- complete_onboarding()
--
-- Saves every piece of onboarding data and flips `onboarding_completed` in
-- one atomic operation, so a failure partway through (e.g. a bad interest
-- value) rolls back the whole submission instead of leaving the student
-- half-onboarded. `security invoker` (not `definer`): this function runs as
-- the calling student, so every statement inside it is still subject to the
-- RLS policies above — the function's only special power is atomicity, not
-- elevated access. The profile it touches is always `auth.uid()`, never a
-- caller-supplied id, so one student can never complete onboarding on
-- another student's behalf.
-- ---------------------------------------------------------------------------

create or replace function public.complete_onboarding(
  p_display_name text,
  p_grade_level integer,
  p_city text,
  p_state text,
  p_country text,
  p_interests text[],
  p_other_interest_text text,
  p_goals text[],
  p_preferences text[],
  p_weekly_availability text,
  p_experience_level text,
  p_guided_mode boolean,
  p_onboarding_version integer
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_interest text;
begin
  if v_profile_id is null then
    raise exception 'complete_onboarding requires an authenticated user';
  end if;

  update public.profiles
  set
    display_name = p_display_name,
    grade_level = p_grade_level,
    city = p_city,
    state = p_state,
    country = p_country,
    weekly_availability = p_weekly_availability,
    experience_level = p_experience_level,
    guided_mode = p_guided_mode,
    onboarding_version = p_onboarding_version,
    onboarding_completed = true,
    onboarding_completed_at = now()
  where id = v_profile_id;

  if not found then
    raise exception 'No profile found for the current user';
  end if;

  delete from public.student_interests where profile_id = v_profile_id;
  if p_interests is not null then
    foreach v_interest in array p_interests loop
      insert into public.student_interests (profile_id, interest, other_text)
      values (
        v_profile_id,
        v_interest,
        case when v_interest = 'Other' then p_other_interest_text else null end
      );
    end loop;
  end if;

  delete from public.student_goals where profile_id = v_profile_id;
  if p_goals is not null then
    insert into public.student_goals (profile_id, goal)
    select v_profile_id, g from unnest(p_goals) as g;
  end if;

  delete from public.student_opportunity_preferences where profile_id = v_profile_id;
  if p_preferences is not null then
    insert into public.student_opportunity_preferences (profile_id, preference_key)
    select v_profile_id, pk from unnest(p_preferences) as pk;
  end if;
end;
$$;

comment on function public.complete_onboarding is
  'Atomically saves all onboarding data for the current user (auth.uid()) and marks onboarding complete. Called once, from the final review step.';

-- Functions are executable by PUBLIC by default in Postgres; restrict this
-- one to authenticated users only (the function also self-checks auth.uid()
-- is not null, so this is defense-in-depth, not the only guard).
revoke execute on function public.complete_onboarding(
  text, integer, text, text, text, text[], text, text[], text[], text, text, boolean, integer
) from public;

grant execute on function public.complete_onboarding(
  text, integer, text, text, text, text[], text, text[], text[], text, text, boolean, integer
) to authenticated;

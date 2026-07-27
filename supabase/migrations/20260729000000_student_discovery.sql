-- Fresh Profile-Based Discovery: persisted history for the "Find more"
-- flow.
--
-- Two new, additive-only tables. No earlier migration is touched. Neither
-- table duplicates opportunity data: `student_opportunity_recommendations`
-- only ever references an existing `public.opportunities` row. Both are
-- owned entirely by the student they belong to (RLS scoped to
-- `auth.uid() = user_id`, same pattern `saved_opportunities` already
-- uses), unlike the Milestone 5 ingestion-internal tables, which have zero
-- client-facing policies — these two are the opposite case: nothing here
-- is written by the service-role ingestion path directly, only by a
-- Server Action acting as the authenticated student. See
-- docs/decision-log.md for the "why RLS-scoped, not service-role-only"
-- reasoning.

-- ---------------------------------------------------------------------------
-- student_discovery_runs
-- ---------------------------------------------------------------------------

create table if not exists public.student_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (
    status in (
      'pending', 'checking_catalog', 'discovering', 'verifying', 'ranking', 'completed', 'failed'
    )
  ),
  batch_number integer not null check (batch_number >= 0),
  -- The exact profile-derived signals this run's source selection and
  -- matching were computed from — a snapshot, not a live reference, so a
  -- later profile edit never silently rewrites the history of why a past
  -- run selected the sources it did.
  profile_snapshot jsonb not null default '{}'::jsonb,
  sources_selected text[] not null default '{}',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  results_found integer not null default 0 check (results_found >= 0),
  error_summary text,
  created_at timestamptz not null default now()
);

comment on table public.student_discovery_runs is
  'One row per "Find more" click that had to fall back to fresh discovery (not every click — see student_opportunity_recommendations.discovery_run_id, nullable for catalog-only batches). status tracks real phases the server action actually passes through, for a future polling UI; this milestone''s UI shows one honest pending state rather than polling it live.';

-- At most one in-flight run per student at a time — the DB-level backstop
-- behind the application-level "block concurrent duplicate runs" check in
-- find-more.ts (which checks-then-inserts; this index is what makes the
-- race condition on two near-simultaneous clicks fail safely instead of
-- creating two rows).
create unique index if not exists student_discovery_runs_one_active_per_user
  on public.student_discovery_runs (user_id)
  where status not in ('completed', 'failed');

create index if not exists student_discovery_runs_user_started_at_idx
  on public.student_discovery_runs (user_id, started_at desc);

alter table public.student_discovery_runs enable row level security;

create policy "Users can view their own discovery runs"
  on public.student_discovery_runs for select
  using (auth.uid() = user_id);

create policy "Users can create their own discovery runs"
  on public.student_discovery_runs for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own discovery runs"
  on public.student_discovery_runs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No delete policy: a run's history (including a failed one) is never
-- removable by the student — same "no delete" precedent as `profiles`.

-- ---------------------------------------------------------------------------
-- student_opportunity_recommendations
-- ---------------------------------------------------------------------------

create table if not exists public.student_opportunity_recommendations (
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  -- Nullable: a recommendation surfaced from the existing verified catalog
  -- (no fresh discovery needed) has no run to point at.
  discovery_run_id uuid references public.student_discovery_runs(id) on delete set null,
  batch_number integer not null check (batch_number >= 0),
  personalized_rank integer not null check (personalized_rank >= 1),
  -- Reuses matching.ts's own MatchTier vocabulary verbatim — no second,
  -- competing tier taxonomy for the same concept.
  recommendation_tier text not null check (recommendation_tier in ('strong_fit', 'possible_fit', 'limited_fit')),
  fit_reasons text[] not null default '{}',
  concerns text[] not null default '{}',
  shown_at timestamptz not null default now(),
  dismissed_at timestamptz,
  saved_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);

comment on table public.student_opportunity_recommendations is
  'The persisted no-repeat model: a row''s mere existence for (user_id, opportunity_id) means "already shown to this student", excluded from every later catalog page or discovery run regardless of device/session. The composite primary key is what makes a re-insert of an already-shown pair a no-op rather than a duplicate — mirrors saved_opportunities exactly.';

create index if not exists student_opportunity_recommendations_user_idx
  on public.student_opportunity_recommendations (user_id, shown_at desc);

create index if not exists student_opportunity_recommendations_run_idx
  on public.student_opportunity_recommendations (discovery_run_id);

alter table public.student_opportunity_recommendations enable row level security;

create policy "Users can view their own recommendations"
  on public.student_opportunity_recommendations for select
  using (auth.uid() = user_id);

create policy "Users can create their own recommendations"
  on public.student_opportunity_recommendations for insert
  with check (auth.uid() = user_id);

-- Update policy is scoped to marking a recommendation dismissed/saved —
-- the identity/tier/rank fields are set once at insert and never revised
-- by the client in this milestone; there is no column-level enforcement
-- of that narrower intent yet (defense-in-depth follow-up, not required
-- for RLS itself, which only needs row-level auth.uid() scoping).
create policy "Users can update their own recommendations"
  on public.student_opportunity_recommendations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No delete policy: a dismissed/expired recommendation still counts
-- toward "already shown" — deleting it would let the exact same
-- opportunity resurface, defeating the no-repeat guarantee it exists for.

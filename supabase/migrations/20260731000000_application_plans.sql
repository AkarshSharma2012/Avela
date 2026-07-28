-- Application Action Center: turns a saved opportunity / "Help me apply"
-- click into a real, trackable application workflow.
--
-- Two new, additive-only tables, owned entirely by the student they belong
-- to (RLS scoped to `auth.uid() = user_id`, the same pattern
-- `saved_opportunities`/`student_discovery_runs`/`recommendation_feedback`
-- already use). Neither table duplicates opportunity data — both only ever
-- reference an existing `public.opportunities` row via `opportunity_id`.

-- ---------------------------------------------------------------------------
-- application_plans
-- ---------------------------------------------------------------------------

create table if not exists public.application_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  -- The eight stages a plan can be in — see src/lib/applications/constants.ts
  -- for labels and src/lib/applications/plan.ts for which transitions
  -- between them are allowed.
  status text not null default 'planning' check (
    status in (
      'interested', 'planning', 'preparing', 'ready_to_apply',
      'applied', 'accepted', 'rejected', 'withdrawn'
    )
  ),
  -- When the student intends to submit — defaults (in app logic, not here)
  -- to a few days before the official deadline, but is always editable and
  -- never required to match it.
  target_submit_date date,
  -- A snapshot of opportunities.application_deadline at the moment this
  -- plan was created, not a live reference. Per spec section 8 ("official
  -- deadlines must not be silently overwritten"): once set, application
  -- logic never overwrites this column on a later opportunity edit — only
  -- an explicit student action (or a one-time backfill) may change it. The
  -- live opportunity row is always still one join away for anything that
  -- does need the current value.
  official_deadline timestamptz,
  notes text,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  decision_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A repeat "Help me apply" / "Move to my applications" click reuses the
  -- existing plan rather than creating a second one for the same
  -- opportunity — mirrors saved_opportunities' one-row-per-pair guarantee.
  unique (user_id, opportunity_id)
);

comment on table public.application_plans is
  'One row per opportunity a student has moved into their application workflow. status is a linear-ish pipeline (interested -> planning -> preparing -> ready_to_apply -> applied -> accepted/rejected/withdrawn); official_deadline is a point-in-time snapshot, never silently overwritten — see src/lib/applications/plan.ts.';
comment on column public.application_plans.official_deadline is
  'Snapshot of opportunities.application_deadline captured when the plan was created or first synced. Never silently overwritten by a later opportunity edit — see docs/decision-log.md.';

create index if not exists application_plans_user_idx
  on public.application_plans (user_id);

create index if not exists application_plans_user_status_idx
  on public.application_plans (user_id, status);

create index if not exists application_plans_target_submit_date_idx
  on public.application_plans (target_submit_date);

create index if not exists application_plans_official_deadline_idx
  on public.application_plans (official_deadline);

drop trigger if exists application_plans_set_updated_at on public.application_plans;

create trigger application_plans_set_updated_at
before update on public.application_plans
for each row
execute function public.set_updated_at();

alter table public.application_plans enable row level security;

create policy "Users can view their own application plans"
  on public.application_plans for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create their own application plans"
  on public.application_plans for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own application plans"
  on public.application_plans for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own application plans"
  on public.application_plans for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- application_tasks
-- ---------------------------------------------------------------------------

create table if not exists public.application_tasks (
  id uuid primary key default gen_random_uuid(),
  -- Denormalized (also derivable via application_plan_id) the same way
  -- every other student-owned table in this schema keeps user_id directly
  -- on the row — it's what RLS scopes against, without a join.
  user_id uuid not null references auth.users(id) on delete cascade,
  application_plan_id uuid not null references public.application_plans(id) on delete cascade,
  title text not null,
  description text,
  due_date date,
  completed_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.application_tasks is
  'Checklist items under an application_plans row — starter suggestions (src/lib/applications/constants.ts) or student-added. completed_at, not a boolean, so "done" always carries a real timestamp for overdue/progress calculations.';

create index if not exists application_tasks_plan_idx
  on public.application_tasks (application_plan_id, sort_order);

create index if not exists application_tasks_user_idx
  on public.application_tasks (user_id);

create index if not exists application_tasks_due_date_idx
  on public.application_tasks (due_date);

drop trigger if exists application_tasks_set_updated_at on public.application_tasks;

create trigger application_tasks_set_updated_at
before update on public.application_tasks
for each row
execute function public.set_updated_at();

alter table public.application_tasks enable row level security;

create policy "Users can view their own application tasks"
  on public.application_tasks for select
  to authenticated
  using (auth.uid() = user_id);

-- Insert/update additionally reverify that application_plan_id actually
-- belongs to the same student — defense-in-depth on top of the app layer
-- (src/lib/applications/actions.ts) always resolving the plan by
-- (id, session user id) before writing a task under it, so a task can
-- never end up attached to another student's plan even if a client sent a
-- foreign application_plan_id alongside their own, real user_id.
create policy "Users can create tasks on their own application plans"
  on public.application_tasks for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.application_plans p
      where p.id = application_plan_id and p.user_id = auth.uid()
    )
  );

create policy "Users can update their own application tasks"
  on public.application_tasks for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.application_plans p
      where p.id = application_plan_id and p.user_id = auth.uid()
    )
  );

create policy "Users can delete their own application tasks"
  on public.application_tasks for delete
  to authenticated
  using (auth.uid() = user_id);

-- Deadline & Reminder Center: one unified, student-owned table every
-- reminder in the product reads from and writes to — official opportunity
-- deadlines, a plan's own target submit date, application task due dates,
-- "remind me later" recommendation feedback, and fully custom reminders.
--
-- Deliberately one table rather than one per source (mirrors the
-- `application_plans`/`application_tasks` pattern: a single, additive,
-- owner-only table, never a duplicate of the data it references). Nothing
-- here duplicates opportunity/plan/task content — only a reference plus
-- the fields needed to show and act on a reminder.

create table if not exists public.student_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Exactly one (or none, for a fully custom reminder) of these three is
  -- meaningful per row — which one is required is enforced below by
  -- student_reminders_type_target, keyed off reminder_type. Each is
  -- on delete cascade, so removing a task/plan/opportunity safely removes
  -- (never "safely invalidates" via an orphaned foreign key) any reminder
  -- that pointed at it — see src/lib/reminders/sync.ts for the rest of
  -- the sync story (updates, not deletes, when a date merely changes).
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  application_plan_id uuid references public.application_plans(id) on delete cascade,
  application_task_id uuid references public.application_tasks(id) on delete cascade,
  reminder_type text not null check (
    reminder_type in (
      'opportunity_deadline', 'target_submit_date', 'application_task',
      'custom', 'follow_up', 'recommendation_reminder'
    )
  ),
  title text not null check (length(trim(title)) > 0),
  message text,
  remind_at timestamptz not null,
  completed_at timestamptz,
  dismissed_at timestamptz,
  -- Set only while a student has snoozed this reminder — the *displayed*
  -- due date for grouping/urgency purposes (see reminders/intelligence.ts),
  -- never a replacement for remind_at itself, which always keeps the
  -- original date so "original deadline remains visible" (spec section 4).
  snoozed_until timestamptz,
  source text not null check (
    source in (
      'automatic', 'student_created', 'recommendation_feedback',
      'application_plan', 'application_task'
    )
  ),
  -- Deterministic, sync-computed identity for an *automatically generated*
  -- reminder occurrence (e.g. "task <id>, 3 days before" or "opportunity
  -- <id> deadline, 14 days before") — see reminders/sync.ts. Null for every
  -- student-created row, which has no such natural key and is never
  -- deduplicated against anything else. The partial unique index below is
  -- what actually prevents a sync run from ever inserting the same
  -- automatic reminder twice.
  dedupe_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Every reminder must be *about* something real: linked to an
  -- opportunity, a plan, or a task, or else explicitly a student-authored
  -- custom/follow-up reminder (which always still carries a real title,
  -- enforced by the check above) — never a bare, meaningless row.
  constraint student_reminders_has_target_or_title check (
    opportunity_id is not null
    or application_plan_id is not null
    or application_task_id is not null
    or reminder_type in ('custom', 'follow_up')
  ),
  -- Which target column a given reminder_type actually requires — mirrors
  -- recommendation_feedback's "reason only on dismissed" style of
  -- cross-field constraint. custom/follow_up are intentionally
  -- unconstrained: a student can attach either to an opportunity, a plan,
  -- both, or neither.
  constraint student_reminders_type_target check (
    (reminder_type = 'opportunity_deadline' and opportunity_id is not null)
    or (reminder_type = 'target_submit_date' and application_plan_id is not null)
    or (reminder_type = 'application_task' and application_task_id is not null)
    or (reminder_type = 'recommendation_reminder' and opportunity_id is not null)
    or (reminder_type in ('custom', 'follow_up'))
  ),
  -- Which source produced each reminder_type — see
  -- src/lib/reminders/constants.ts's REMINDER_TYPE_SOURCE for the same
  -- mapping kept in sync on the application side.
  constraint student_reminders_type_source check (
    (reminder_type = 'opportunity_deadline' and source = 'automatic')
    or (reminder_type = 'target_submit_date' and source = 'application_plan')
    or (reminder_type = 'application_task' and source = 'application_task')
    or (reminder_type = 'recommendation_reminder' and source = 'recommendation_feedback')
    or (reminder_type in ('custom', 'follow_up') and source = 'student_created')
  ),
  constraint student_reminders_message_length check (message is null or length(message) <= 2000),
  constraint student_reminders_title_length check (length(title) <= 200)
);

comment on table public.student_reminders is
  'Unified Deadline & Reminder Center — one row per reminder occurrence, whether system-generated (opportunity/plan/task dates, synced by reminders/sync.ts) or student-created. See docs/decision-log.md and the type/source check constraints above for the shape every row must satisfy.';
comment on column public.student_reminders.dedupe_key is
  'Deterministic key for one automatically-generated reminder occurrence (type + target id + offset) — null for student-created rows. Enforced unique per user by student_reminders_dedupe_idx below, which is how sync.ts avoids ever inserting the same automatic reminder twice.';

create index if not exists student_reminders_user_idx
  on public.student_reminders (user_id);

create index if not exists student_reminders_user_remind_at_idx
  on public.student_reminders (user_id, remind_at);

create index if not exists student_reminders_opportunity_idx
  on public.student_reminders (opportunity_id);

create index if not exists student_reminders_plan_idx
  on public.student_reminders (application_plan_id);

create index if not exists student_reminders_task_idx
  on public.student_reminders (application_task_id);

-- Duplicate-prevention backstop for automatic reminders (spec section 1):
-- a second sync run racing (or re-running) against the same occurrence
-- upserts in place rather than creating a sibling row. Partial so
-- student-created rows (dedupe_key always null) are never constrained
-- against each other.
create unique index if not exists student_reminders_dedupe_idx
  on public.student_reminders (user_id, dedupe_key)
  where dedupe_key is not null;

drop trigger if exists student_reminders_set_updated_at on public.student_reminders;

create trigger student_reminders_set_updated_at
before update on public.student_reminders
for each row
execute function public.set_updated_at();

alter table public.student_reminders enable row level security;

create policy "Users can view their own reminders"
  on public.student_reminders for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create their own reminders"
  on public.student_reminders for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own reminders"
  on public.student_reminders for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own reminders"
  on public.student_reminders for delete
  to authenticated
  using (auth.uid() = user_id);

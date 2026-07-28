-- Recommendation Feedback Loop: durable, cross-batch record of what a
-- student said about a specific opportunity — "not for me" (with a reason),
-- "more like this", "saved" (kept in sync with saved_opportunities, not a
-- second copy of that decision), "help me apply", and "remind me later".
--
-- This is deliberately separate from student_opportunity_recommendations'
-- own dismissed_at/saved_at columns (see 20260729000000_student_discovery.sql):
-- those flag a single batch row as handled, this table is the durable "why"
-- log ranking.ts/discovery-sources.ts read across every future batch. No
-- opportunity data is duplicated — only a reference to an existing
-- public.opportunities row.

-- student_opportunity_recommendations (20260729000000) has no surrogate
-- key, only a composite (user_id, opportunity_id) primary key — add one so
-- a feedback row can optionally reference the exact recommendation batch
-- it was given on, without changing that table's existing primary key or
-- any of its existing policies/indexes.
alter table public.student_opportunity_recommendations
  add column if not exists id uuid not null default gen_random_uuid();

create unique index if not exists student_opportunity_recommendations_id_idx
  on public.student_opportunity_recommendations (id);

create table if not exists public.recommendation_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  -- Nullable: identical (user_id, opportunity_id) reference is always
  -- available, but the specific batch row is only known when this feedback
  -- was given from a rendered recommendation (not, e.g., a saved item
  -- added back before this milestone shipped).
  recommendation_id uuid references public.student_opportunity_recommendations(id) on delete set null,
  feedback_type text not null check (
    feedback_type in ('dismissed', 'more_like_this', 'saved', 'help_me_apply', 'remind_later')
  ),
  -- Only meaningful (and only ever set) on a 'dismissed' row.
  reason text check (
    reason in (
      'not_interested', 'too_expensive', 'too_far', 'wrong_timing',
      'too_competitive', 'wrong_format', 'eligibility_mismatch',
      'already_applied', 'other'
    )
  ),
  note text,
  -- Only meaningful (and only ever set) on a 'remind_later' row. Timestamp,
  -- not date, so "1 month before deadline" can carry the deadline's own
  -- time-of-day rather than being truncated to midnight.
  reminder_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recommendation_feedback_reason_only_on_dismissed
    check (reason is null or feedback_type = 'dismissed'),
  constraint recommendation_feedback_reminder_only_on_remind_later
    check (reminder_at is null or feedback_type = 'remind_later'),
  -- One active record per (user, opportunity, type) — a repeat "save" or
  -- "help me apply" click upserts in place rather than piling up rows.
  unique (user_id, opportunity_id, feedback_type)
);

comment on table public.recommendation_feedback is
  'Cross-batch feedback signal, read by ranking.ts (bounded feedbackRank) and discovery-sources.ts (source scoring) — never joined into a listing''s own data, and never letting a single row override eligibility/verification.';

create index if not exists recommendation_feedback_user_idx
  on public.recommendation_feedback (user_id);

alter table public.recommendation_feedback enable row level security;

create policy "Users can view their own recommendation feedback"
  on public.recommendation_feedback for select
  using (auth.uid() = user_id);

create policy "Users can create their own recommendation feedback"
  on public.recommendation_feedback for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own recommendation feedback"
  on public.recommendation_feedback for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Unlike every other student-owned table in this schema, feedback is
-- deletable by design: "undo" on a dismissal and unsaving a saved
-- opportunity both remove the row outright rather than leaving a stale
-- record behind (the spec's "never resurface unless explicitly reset").
create policy "Users can delete their own recommendation feedback"
  on public.recommendation_feedback for delete
  using (auth.uid() = user_id);

drop trigger if exists recommendation_feedback_set_updated_at on public.recommendation_feedback;

create trigger recommendation_feedback_set_updated_at
before update on public.recommendation_feedback
for each row
execute function public.set_updated_at();

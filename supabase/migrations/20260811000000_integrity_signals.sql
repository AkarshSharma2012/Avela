-- Milestone 10.7 — Anti-Gaming / Anti-Collusion Signals + Rate Limiting.
--
-- Three tables. `integrity_signals` and `integrity_reviews` get **zero
-- client-facing policies at all** — not even a read-only one for the
-- subject student — the same "five new tables, zero client-facing
-- policies" pattern Milestone 5 established for
-- opportunity_ingestion/review tables. This is deliberate and stricter
-- than almost every other table in this codebase: spec section 9 is
-- explicit that these signals must never be shown to the student they're
-- about (that would itself be the accusatory surface the spec is trying to
-- avoid) — only a reviewer, through a service-role connection, ever reads
-- them.
--
-- `rate_limit_counters` is a plain atomic counter table (insert ... on
-- conflict do update, race-safe by construction) — also zero client
-- policies, since a rate limit a client could read or write directly
-- wouldn't actually limit anything.

create table if not exists public.integrity_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_item_id uuid references public.portfolio_items(id) on delete cascade,
  -- A second student this signal concerns (circular verification, a shared
  -- verifier) — never required, since most signals are single-student.
  related_user_id uuid references auth.users(id) on delete cascade,
  signal_type text not null check (
    signal_type in (
      'repeated_evidence_hash', 'near_identical_narrative', 'verifier_reused_across_students',
      'circular_student_verification', 'domain_mismatch_or_suspicious', 'request_velocity',
      'edit_shortly_after_confirmation', 'request_spam_cancel_cycle', 'connect_disconnect_around_verification',
      'fork_history_copied', 'verifier_scope_narrower_than_claim', 'split_project_farming'
    )
  ),
  risk_level text not null default 'normal' check (
    risk_level in ('normal', 'additional_evidence_recommended', 'manual_review', 'temporarily_limited')
  ),
  -- Minimal, structured, privacy-safe facts only (counts, ids, a short
  -- neutral note) — never free-form scraped content, never a value
  -- judgment about the student (see docs/security.md's forbidden-language
  -- rule, reused here via src/lib/integrity/signals.ts).
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.integrity_signals is
  'Reviewer-only explainable risk signals — never shown to the subject student, never a truth judgment, never an automatic rejection. See docs/security.md (Milestone 10.7).';

create index if not exists integrity_signals_user_idx
  on public.integrity_signals (user_id);

create index if not exists integrity_signals_type_idx
  on public.integrity_signals (signal_type, created_at);

create index if not exists integrity_signals_risk_idx
  on public.integrity_signals (risk_level)
  where risk_level <> 'normal';

alter table public.integrity_signals enable row level security;

-- No policies at all — service-role only, same as
-- opportunity_ingestion_runs/raw_opportunity_records (Milestone 5).

create table if not exists public.integrity_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  signal_id uuid not null references public.integrity_signals(id) on delete cascade,
  reviewer_email text not null check (length(reviewer_email) <= 320),
  decision text not null check (decision in ('dismissed', 'needs_more_evidence', 'limited_temporarily', 'escalated')),
  reason text not null check (length(reason) between 1 and 2000),
  created_at timestamptz not null default now()
);

comment on table public.integrity_reviews is
  'Append-only reviewer decisions on integrity_signals — a reversal is always a new row, never an update to a prior one. See docs/security.md (Milestone 10.7).';

create index if not exists integrity_reviews_signal_idx
  on public.integrity_reviews (signal_id, created_at);

create index if not exists integrity_reviews_user_idx
  on public.integrity_reviews (user_id);

alter table public.integrity_reviews enable row level security;

-- No policies at all — service-role only. No update or delete path exists
-- anywhere in application code either: a reversed decision is always a
-- fresh row (see src/lib/integrity/actions.ts).

create table if not exists public.rate_limit_counters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null check (
    bucket in (
      'verification_request', 'verification_resend', 'verifier_response', 'osint_check',
      'connect_attempt', 'possession_challenge', 'reviewer_decision'
    )
  ),
  -- Truncated to a fixed window boundary by the application
  -- (src/lib/integrity/rate-limit.ts) — e.g. every request in the same
  -- hour shares one row, incremented via insert ... on conflict do update,
  -- which is atomic per row and therefore race-safe without a custom
  -- Postgres function.
  window_start timestamptz not null,
  count integer not null default 1 check (count > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rate_limit_counters_unique_window unique (user_id, bucket, window_start)
);

comment on table public.rate_limit_counters is
  'Server-side, DB-backed rate limiting — a client that could read or write this directly would defeat the point, so it has no client-facing policy at all. See docs/security.md (Milestone 10.7).';

create index if not exists rate_limit_counters_lookup_idx
  on public.rate_limit_counters (user_id, bucket, window_start);

drop trigger if exists rate_limit_counters_set_updated_at on public.rate_limit_counters;

create trigger rate_limit_counters_set_updated_at
before update on public.rate_limit_counters
for each row
execute function public.set_updated_at();

alter table public.rate_limit_counters enable row level security;

-- No policies at all — service-role only.

-- ---------------------------------------------------------------------------
-- increment_rate_limit_counter()
-- ---------------------------------------------------------------------------
--
-- Lets a student's own authenticated session safely bump their own counter
-- without needing a service-role client for something as routine as a rate
-- limit — the same "resolve identity via auth.uid() inside the function
-- body, never trust a passed-in id" pattern complete_onboarding() (Milestone
-- 2) established. security definer bypasses the table's own zero-policy
-- RLS (that's the point — the table still can't be read/written directly),
-- but the function grants no capability beyond "increment my own counter
-- for a bucket I specify," which a client already conceptually triggers by
-- taking the rate-limited action in the first place.

create or replace function public.increment_rate_limit_counter(p_bucket text, p_window_start timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.rate_limit_counters (user_id, bucket, window_start, count)
  values (auth.uid(), p_bucket, p_window_start, 1)
  on conflict (user_id, bucket, window_start)
  do update set count = rate_limit_counters.count + 1, updated_at = now()
  returning count into v_count;

  return v_count;
end;
$$;

revoke all on function public.increment_rate_limit_counter(text, timestamptz) from public;
grant execute on function public.increment_rate_limit_counter(text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- increment_rate_limit_counter_for_user()
-- ---------------------------------------------------------------------------
--
-- For the one case the student-session RPC above can't cover: a verifier
-- acting through a one-time link has no Avela session at all, so there is
-- no auth.uid() to resolve — the rate limit has to be keyed to the
-- *claim's owning student* instead, applied server-side from the same
-- service-role connection actions.ts already uses for the rest of the
-- verifier-confirm flow. Restricted to the service_role Postgres role only
-- (never authenticated, never public) — a client session can never call
-- this to increment an arbitrary student's counter.

create or replace function public.increment_rate_limit_counter_for_user(p_user_id uuid, p_bucket text, p_window_start timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.rate_limit_counters (user_id, bucket, window_start, count)
  values (p_user_id, p_bucket, p_window_start, 1)
  on conflict (user_id, bucket, window_start)
  do update set count = rate_limit_counters.count + 1, updated_at = now()
  returning count into v_count;

  return v_count;
end;
$$;

revoke all on function public.increment_rate_limit_counter_for_user(uuid, text, timestamptz) from public;
grant execute on function public.increment_rate_limit_counter_for_user(uuid, text, timestamptz) to service_role;

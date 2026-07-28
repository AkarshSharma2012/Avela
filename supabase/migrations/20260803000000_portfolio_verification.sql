-- Milestone 10.5 — Portfolio Verification & Trust Signals.
--
-- An evidence-based verification *layer* on top of the existing Portfolio &
-- Evidence Vault (see 20260802000000_student_portfolio.sql): how strongly a
-- portfolio_items row is supported, never a claim of absolute truth. Two
-- new, additive-only tables. RLS is owner-only for every student-facing
-- read/write, exactly like the rest of the portfolio schema — the
-- verifier-confirms-a-link and reviewer-makes-a-decision flows are the only
-- two paths that touch another student's row, and both do so through a
-- service-role connection from a narrowly-scoped server action (see
-- src/lib/verification/repository.ts), never through a client-facing RLS
-- policy. No policy here ever grants the `anon` role anything.

-- ---------------------------------------------------------------------------
-- portfolio_verifications
-- ---------------------------------------------------------------------------
--
-- One row per portfolio item — the row *is* the current verification state
-- (unique on portfolio_item_id), updated in place as the student adds
-- evidence, requests confirmation, or a reviewer makes a call. Every
-- transition is additionally recorded, immutably, in
-- portfolio_verification_events below; this table only ever holds "where
-- things stand right now."

create table if not exists public.portfolio_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_item_id uuid not null references public.portfolio_items(id) on delete cascade,
  verification_level text not null default 'unverified' check (
    verification_level in ('unverified', 'evidence_added', 'externally_confirmed', 'needs_review', 'rejected')
  ),
  verification_method text check (
    verification_method is null or verification_method in (
      'uploaded_document', 'official_url', 'organization_email',
      'teacher_or_mentor', 'recommendation_contact', 'manual_review', 'system_consistency_check'
    )
  ),
  -- Must belong to the same student *and* the same item — enforced below in
  -- both the insert and update policies (defense-in-depth on top of
  -- src/lib/verification/repository.ts always resolving the file by
  -- (id, session user id, item id) first).
  evidence_file_id uuid references public.portfolio_files(id) on delete set null,
  evidence_url text check (evidence_url is null or (length(evidence_url) <= 2000 and evidence_url like 'https://%')),
  -- Deliberately minimal — see docs/security.md (Milestone 10.5): no home
  -- address, phone number, or school schedule ever belongs on this row.
  verifier_name text check (verifier_name is null or length(verifier_name) <= 200),
  verifier_email text check (
    verifier_email is null or (length(verifier_email) <= 320 and verifier_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  ),
  verifier_organization text check (verifier_organization is null or length(verifier_organization) <= 200),
  -- sha256 hex digest of the one-time link token — the raw token is never
  -- persisted anywhere (see src/lib/verification/tokens.ts). A verifier's
  -- link is looked up by hashing whatever they present and comparing.
  verification_code_hash text check (verification_code_hash is null or length(verification_code_hash) = 64),
  requested_at timestamptz,
  verified_at timestamptz,
  -- Expiry of the *verification link/request itself* — a link past this
  -- moment is treated as invalid automatically by every read path in
  -- src/lib/verification/tokens.ts, never only by a UI check.
  expires_at timestamptz,
  review_notes text check (review_notes is null or length(review_notes) <= 2000),
  -- Small, extensible facts that don't warrant their own column: e.g.
  -- declined_at/cancelled_at (request-flow bookkeeping — see
  -- src/lib/verification/request.ts's deriveRequestStatus), resend history,
  -- or the evidence's own claimed expiration date for expiry checks.
  -- Never used to store file bytes, full document text, or anything a
  -- log line shouldn't casually contain.
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolio_verifications_one_per_item unique (portfolio_item_id)
);

comment on table public.portfolio_verifications is
  'Current evidence-verification state for one portfolio item — never a claim of absolute truth, only how strongly the entry is supported. Owner-only; see docs/security.md (Milestone 10.5).';

create index if not exists portfolio_verifications_user_idx
  on public.portfolio_verifications (user_id);

create index if not exists portfolio_verifications_level_idx
  on public.portfolio_verifications (user_id, verification_level);

create index if not exists portfolio_verifications_code_hash_idx
  on public.portfolio_verifications (verification_code_hash)
  where verification_code_hash is not null;

create index if not exists portfolio_verifications_expires_idx
  on public.portfolio_verifications (expires_at)
  where expires_at is not null;

drop trigger if exists portfolio_verifications_set_updated_at on public.portfolio_verifications;

create trigger portfolio_verifications_set_updated_at
before update on public.portfolio_verifications
for each row
execute function public.set_updated_at();

alter table public.portfolio_verifications enable row level security;

create policy "Users can view their own portfolio verifications"
  on public.portfolio_verifications for select
  to authenticated
  using (auth.uid() = user_id);

-- Reverifies the item belongs to the caller, and that a non-null
-- evidence_file_id is both the caller's own file *and* attached to this
-- same item — a client can never point a verification row at someone
-- else's file, or at one of the student's own files that belongs to a
-- different item.
create policy "Users can create their own portfolio verifications"
  on public.portfolio_verifications for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.portfolio_items pi where pi.id = portfolio_item_id and pi.user_id = auth.uid())
    and (
      evidence_file_id is null
      or exists (
        select 1 from public.portfolio_files pf
        where pf.id = evidence_file_id and pf.user_id = auth.uid() and pf.portfolio_item_id = portfolio_item_id
      )
    )
  );

create policy "Users can update their own portfolio verifications"
  on public.portfolio_verifications for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      evidence_file_id is null
      or exists (
        select 1 from public.portfolio_files pf
        where pf.id = evidence_file_id and pf.user_id = auth.uid() and pf.portfolio_item_id = portfolio_item_id
      )
    )
  );

-- No delete policy: "canceling" a verification request is a state update
-- (see src/lib/verification/request.ts), never a row delete — the record
-- (and its audit trail) survives until the portfolio item itself is
-- removed, at which point the cascade above takes it with it.

-- ---------------------------------------------------------------------------
-- portfolio_verification_events
-- ---------------------------------------------------------------------------
--
-- Append-only audit trail. No update or delete policy exists for any
-- client-facing role at all, on any row, ever — that omission (not a
-- "students can't edit their own") is what makes these events immutable.

create table if not exists public.portfolio_verification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_item_id uuid not null references public.portfolio_items(id) on delete cascade,
  verification_id uuid not null references public.portfolio_verifications(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'evidence_added', 'evidence_replaced', 'official_url_added',
      'verification_requested', 'verification_resent', 'verification_cancelled',
      'verification_confirmed', 'verification_declined', 'correction_requested',
      'verification_expired', 'reviewer_decision', 'consistency_check_run', 'level_changed'
    )
  ),
  actor_type text not null check (actor_type in ('student', 'verifier', 'reviewer', 'system')),
  previous_level text check (
    previous_level is null or previous_level in ('unverified', 'evidence_added', 'externally_confirmed', 'needs_review', 'rejected')
  ),
  new_level text check (
    new_level is null or new_level in ('unverified', 'evidence_added', 'externally_confirmed', 'needs_review', 'rejected')
  ),
  reason text check (reason is null or length(reason) <= 2000),
  created_at timestamptz not null default now()
);

comment on table public.portfolio_verification_events is
  'Immutable audit trail for portfolio_verifications — insert-only for every role, including the owning student. See docs/security.md (Milestone 10.5).';

create index if not exists portfolio_verification_events_user_idx
  on public.portfolio_verification_events (user_id);

create index if not exists portfolio_verification_events_verification_idx
  on public.portfolio_verification_events (verification_id, created_at);

create index if not exists portfolio_verification_events_item_idx
  on public.portfolio_verification_events (portfolio_item_id);

alter table public.portfolio_verification_events enable row level security;

create policy "Users can view their own portfolio verification events"
  on public.portfolio_verification_events for select
  to authenticated
  using (auth.uid() = user_id);

-- Students may only ever log events as themselves, about their own item and
-- verification row. actor_type = 'student' covers every student-initiated
-- action; the one exception is event_type = 'consistency_check_run' with
-- actor_type = 'system', which src/lib/verification/actions.ts fires
-- synchronously in the same request as a student's own evidence upload
-- (the check runs *because* the student acted, but it's the system, not
-- the student, making the call). A client can never claim actor_type =
-- 'verifier' or 'reviewer', or any other event_type under 'system' —
-- those are only ever written by a service-role connection from a
-- narrowly-scoped server action (see src/lib/verification/repository.ts),
-- which bypasses RLS entirely and so needs no policy of its own here.
create policy "Users can log their own verification events"
  on public.portfolio_verification_events for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (
      (actor_type = 'student' and event_type <> 'consistency_check_run')
      or (actor_type = 'system' and event_type = 'consistency_check_run')
    )
    and exists (
      select 1 from public.portfolio_verifications pv
      where pv.id = verification_id and pv.user_id = auth.uid() and pv.portfolio_item_id = portfolio_item_id
    )
  );

-- No update or delete policy on this table for any role — see the table
-- comment above.

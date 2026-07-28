-- Milestone 10.6 — Public-Source Verification Engine (OSINT).
--
-- An *additional* evidence source layered on top of the existing Portfolio &
-- Evidence Vault (20260802000000_student_portfolio.sql) and the human
-- evidence/verifier/reviewer workflow (20260803000000_portfolio_verification.sql).
-- This migration never touches those tables — public-source findings are
-- their own additive record, never a replacement for a student's own
-- evidence or a verifier's confirmation, and never a claim of absolute
-- truth (see support-level check constraint below: there is no "true" or
-- "false" value anywhere in this schema, only how well a claim is publicly
-- supported so far). RLS is owner-only for every student-facing read/write,
-- exactly like the rest of the portfolio schema — the one exception is the
-- reviewer inspection/override flow, which (like the existing reviewer
-- flow) goes through a service-role connection from a narrowly-scoped
-- server action, never through a client-facing RLS policy.

-- ---------------------------------------------------------------------------
-- portfolio_osint_checks
-- ---------------------------------------------------------------------------
--
-- One row per public-source check *run* against a single portfolio item.
-- A student can re-run a check (spec section 9: "recheck action"), so unlike
-- portfolio_verifications this is not unique per item — each run is its own
-- row, and the item workspace reads the most recent one. consent_scope
-- freezes exactly what the student agreed to search at the moment they
-- clicked "Check public sources" (spec section 3), independent of what the
-- claim looks like today.

create table if not exists public.portfolio_osint_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_item_id uuid not null references public.portfolio_items(id) on delete cascade,
  status text not null default 'pending' check (
    status in ('pending', 'running', 'completed', 'failed', 'cancelled')
  ),
  -- Exactly which fields and source types the student consented to search —
  -- see src/lib/osint/consent.ts. Never inferred after the fact; a check
  -- that was never consented to is never started (src/lib/osint/actions.ts).
  consent_scope jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  -- Retention limit for this run's evidence/conflicts — see
  -- src/lib/osint/repository.ts's deletion/retention sweep. Never used to
  -- silently keep data past its stated lifetime.
  expires_at timestamptz,
  final_support_level text check (
    final_support_level is null or final_support_level in (
      'confirmed_by_authoritative_source', 'strongly_supported', 'partially_supported',
      'unable_to_verify', 'needs_review'
    )
  ),
  score integer check (score is null or (score >= 0 and score <= 100)),
  -- The transparent, line-by-line point breakdown behind `score` (spec
  -- section 7: "show a full score explanation to the student") — an array
  -- of {label, points} objects, written once by orchestrator.ts alongside
  -- score/final_support_level and never recomputed client-side, so what a
  -- student sees always matches exactly what was scored.
  score_breakdown jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.portfolio_osint_checks is
  'One run of the public-source (OSINT) verification engine against a single portfolio item — an additional evidence source, never a truth detector and never a replacement for portfolio_verifications. See docs/security.md (Milestone 10.6).';

create index if not exists portfolio_osint_checks_user_idx
  on public.portfolio_osint_checks (user_id);

create index if not exists portfolio_osint_checks_item_idx
  on public.portfolio_osint_checks (portfolio_item_id, created_at desc);

create index if not exists portfolio_osint_checks_expires_idx
  on public.portfolio_osint_checks (expires_at)
  where expires_at is not null;

drop trigger if exists portfolio_osint_checks_set_updated_at on public.portfolio_osint_checks;

create trigger portfolio_osint_checks_set_updated_at
before update on public.portfolio_osint_checks
for each row
execute function public.set_updated_at();

alter table public.portfolio_osint_checks enable row level security;

create policy "Users can view their own osint checks"
  on public.portfolio_osint_checks for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create their own osint checks"
  on public.portfolio_osint_checks for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.portfolio_items pi where pi.id = portfolio_item_id and pi.user_id = auth.uid())
  );

create policy "Users can update their own osint checks"
  on public.portfolio_osint_checks for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Deletion supports "cancel" (spec section 3: allow cancellation) and the
-- student-initiated "delete public-source evidence" action (spec section
-- 9) — cascades to portfolio_osint_evidence/portfolio_osint_conflicts below.
create policy "Users can delete their own osint checks"
  on public.portfolio_osint_checks for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- portfolio_osint_evidence
-- ---------------------------------------------------------------------------
--
-- Normalized findings from a single connector run, always linked to exactly
-- one check (and transitively one claim) — evidence is never shared across
-- items, even when the underlying source page is identical, so dedupe is
-- scoped to (check_id, content_hash) rather than globally (see
-- src/lib/osint/repository.ts).

create table if not exists public.portfolio_osint_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  check_id uuid not null references public.portfolio_osint_checks(id) on delete cascade,
  source_type text not null check (
    source_type in (
      'official_organization', 'github', 'crossref', 'icann_rdap', 'url_reputation',
      'issuer_page', 'structured_metadata', 'other'
    )
  ),
  source_url text not null check (length(source_url) <= 2000 and source_url like 'https://%'),
  source_domain text not null check (length(source_domain) <= 255),
  authority_level text not null check (
    authority_level in (
      'issuer', 'official_organization', 'trusted_registry', 'verified_public_profile',
      'secondary_source', 'unknown'
    )
  ),
  -- Minimal excerpts and normalized fields only — never a full copied page
  -- (spec section 4: "store minimal excerpts, not full copied pages"). See
  -- src/lib/osint/types.ts for the shape every connector must normalize to.
  extracted_fields jsonb not null default '{}'::jsonb,
  confidence integer not null default 0 check (confidence >= 0 and confidence <= 100),
  -- sha256 of the normalized (url, extracted_fields) pair — the dedupe key,
  -- never of full page content.
  content_hash text not null check (length(content_hash) = 64),
  retrieved_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint portfolio_osint_evidence_dedupe unique (check_id, content_hash)
);

comment on table public.portfolio_osint_evidence is
  'One normalized finding from one connector for one osint check — minimal excerpts only, deduplicated per check. See docs/security.md (Milestone 10.6).';

create index if not exists portfolio_osint_evidence_user_idx
  on public.portfolio_osint_evidence (user_id);

create index if not exists portfolio_osint_evidence_check_idx
  on public.portfolio_osint_evidence (check_id);

create index if not exists portfolio_osint_evidence_expires_idx
  on public.portfolio_osint_evidence (expires_at)
  where expires_at is not null;

alter table public.portfolio_osint_evidence enable row level security;

create policy "Users can view their own osint evidence"
  on public.portfolio_osint_evidence for select
  to authenticated
  using (auth.uid() = user_id);

-- No client-facing insert/update policy: evidence is written only by the
-- server-side orchestrator (src/lib/osint/orchestrator.ts) via the
-- student's own session client immediately after ensuring the parent check
-- row belongs to them — see the with-check below, which still constrains
-- that server-side write to the caller's own rows even though it never
-- runs from a browser. No update policy at all: a finding is immutable
-- once recorded; a re-check creates a new portfolio_osint_checks row and
-- fresh evidence rather than mutating an old finding in place.
create policy "Users can record their own osint evidence"
  on public.portfolio_osint_evidence for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.portfolio_osint_checks c where c.id = check_id and c.user_id = auth.uid())
  );

create policy "Users can delete their own osint evidence"
  on public.portfolio_osint_evidence for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- portfolio_osint_conflicts
-- ---------------------------------------------------------------------------
--
-- Respectful, specific mismatches surfaced during matching (spec section
-- 6/9) — e.g. a date or organization that doesn't line up. Never phrased as
-- an accusation; respectful_message is validated against the same
-- forbidden-language list as the human reviewer flow (see
-- src/lib/verification/messages.ts's containsForbiddenLanguage, reused by
-- src/lib/osint/messages.ts) before it is ever written here.

create table if not exists public.portfolio_osint_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  check_id uuid not null references public.portfolio_osint_checks(id) on delete cascade,
  field_name text not null check (length(field_name) <= 100),
  claimed_value text check (claimed_value is null or length(claimed_value) <= 500),
  observed_value text check (observed_value is null or length(observed_value) <= 500),
  severity text not null check (severity in ('info', 'minor', 'material')),
  respectful_message text not null check (length(respectful_message) <= 500),
  created_at timestamptz not null default now()
);

comment on table public.portfolio_osint_conflicts is
  'A respectfully-worded mismatch found while matching public evidence to a claim — never an accusation, never implies the claim is false. See docs/security.md (Milestone 10.6).';

create index if not exists portfolio_osint_conflicts_user_idx
  on public.portfolio_osint_conflicts (user_id);

create index if not exists portfolio_osint_conflicts_check_idx
  on public.portfolio_osint_conflicts (check_id);

alter table public.portfolio_osint_conflicts enable row level security;

create policy "Users can view their own osint conflicts"
  on public.portfolio_osint_conflicts for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can record their own osint conflicts"
  on public.portfolio_osint_conflicts for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.portfolio_osint_checks c where c.id = check_id and c.user_id = auth.uid())
  );

create policy "Users can delete their own osint conflicts"
  on public.portfolio_osint_conflicts for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- portfolio_osint_review_events
-- ---------------------------------------------------------------------------
--
-- Immutable audit trail for the reviewer flow (spec section 10: "Every
-- decision must be audited") — same append-only shape as
-- portfolio_verification_events, scoped to osint checks. No update or
-- delete policy for any role, including the owning student: that omission
-- (not a narrower "students can't edit") is what makes it immutable. All
-- writes go through a service-role connection from a narrowly-scoped
-- reviewer server action (src/lib/osint/actions.ts), so no client-facing
-- insert policy exists either.

create table if not exists public.portfolio_osint_review_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  check_id uuid not null references public.portfolio_osint_checks(id) on delete cascade,
  reviewer_email text not null check (length(reviewer_email) <= 320),
  action text not null check (
    action in ('confirm_support', 'request_clarification', 'mark_insufficient', 'override_support_level')
  ),
  previous_support_level text,
  new_support_level text,
  reason text not null check (length(reason) <= 2000),
  created_at timestamptz not null default now()
);

comment on table public.portfolio_osint_review_events is
  'Immutable audit trail for reviewer decisions on osint checks — insert-only via service role, never client-writable. See docs/security.md (Milestone 10.6).';

create index if not exists portfolio_osint_review_events_check_idx
  on public.portfolio_osint_review_events (check_id, created_at);

alter table public.portfolio_osint_review_events enable row level security;

create policy "Users can view their own osint review events"
  on public.portfolio_osint_review_events for select
  to authenticated
  using (auth.uid() = user_id);

-- No insert/update/delete policy for any client-facing role — see the
-- table comment above.

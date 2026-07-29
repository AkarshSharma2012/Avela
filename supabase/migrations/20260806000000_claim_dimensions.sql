-- Milestone 10.7 — Claim-Dimension Model.
--
-- Adds a per-dimension trust layer on top of the existing
-- portfolio_verifications row (20260803000000_portfolio_verification.sql).
-- That table's single verification_level stays exactly as-is and remains
-- authoritative for every existing read/write path — nothing here changes
-- its meaning, its values, or any query against it. This migration is
-- purely additive: an item with zero claim_dimension_results rows behaves
-- identically to how it behaved before this milestone.
--
-- The point of the new layer is the milestone's core rule: one successful
-- check must never verify an entire entry. Instead of one level, an item
-- now tracks up to eleven independent dimensions (identity_control,
-- project_or_activity_exists, account_or_asset_control,
-- authorship_or_contribution, role, dates_and_duration,
-- organization_relationship, award_or_credential, output_or_deliverable,
-- impact_or_outcome, third_party_confirmation), each with its own status.
-- src/lib/claims/rollup.ts projects these into a student-facing summary —
-- it never writes back to portfolio_verifications.verification_level.

-- ---------------------------------------------------------------------------
-- claim_dimension_results
-- ---------------------------------------------------------------------------
--
-- One row per (portfolio_item_id, dimension) — same "current state, updated
-- in place" shape as portfolio_verifications, with every transition also
-- recorded immutably in claim_dimension_events below.

create table if not exists public.claim_dimension_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_item_id uuid not null references public.portfolio_items(id) on delete cascade,
  dimension text not null check (
    dimension in (
      'identity_control', 'project_or_activity_exists', 'account_or_asset_control',
      'authorship_or_contribution', 'role', 'dates_and_duration',
      'organization_relationship', 'award_or_credential', 'output_or_deliverable',
      'impact_or_outcome', 'third_party_confirmation'
    )
  ),
  status text not null default 'not_checked' check (
    status in (
      'not_checked', 'unable_to_verify', 'partially_supported',
      'strongly_supported', 'externally_confirmed', 'needs_review'
    )
  ),
  -- Set whenever a material edit invalidates this specific dimension (see
  -- 20260810000000_material_hash.sql) without necessarily resetting status
  -- to not_checked — a reviewer should be able to see "this was strongly
  -- supported, but the claim changed since" rather than losing that context.
  stale boolean not null default false,
  -- Pointers only (evidence file/verification/OSINT-check/connected-identity
  -- ids as JSON) — never file bytes, never a full document, matching the
  -- existing metadata-column convention on portfolio_verifications.
  evidence_ref jsonb not null default '{}'::jsonb,
  notes text check (notes is null or length(notes) <= 2000),
  updated_by_actor_type text not null default 'system' check (
    updated_by_actor_type in ('student', 'verifier', 'reviewer', 'system')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint claim_dimension_results_one_per_item_dimension unique (portfolio_item_id, dimension)
);

comment on table public.claim_dimension_results is
  'Current per-dimension trust state for one portfolio item — never a single verified/unverified flag. See docs/security.md (Milestone 10.7).';

create index if not exists claim_dimension_results_user_idx
  on public.claim_dimension_results (user_id);

create index if not exists claim_dimension_results_item_idx
  on public.claim_dimension_results (portfolio_item_id);

create index if not exists claim_dimension_results_stale_idx
  on public.claim_dimension_results (user_id, stale)
  where stale = true;

drop trigger if exists claim_dimension_results_set_updated_at on public.claim_dimension_results;

create trigger claim_dimension_results_set_updated_at
before update on public.claim_dimension_results
for each row
execute function public.set_updated_at();

alter table public.claim_dimension_results enable row level security;

create policy "Users can view their own claim dimension results"
  on public.claim_dimension_results for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create their own claim dimension results"
  on public.claim_dimension_results for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.portfolio_items pi where pi.id = portfolio_item_id and pi.user_id = auth.uid())
  );

create policy "Users can update their own claim dimension results"
  on public.claim_dimension_results for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No delete policy: a dimension is never "un-added" by a client, only ever
-- re-evaluated in place — same reasoning as portfolio_verifications.

-- ---------------------------------------------------------------------------
-- claim_dimension_events
-- ---------------------------------------------------------------------------
--
-- Append-only audit trail, identical immutability shape to
-- portfolio_verification_events: no update or delete policy for any role.

create table if not exists public.claim_dimension_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_item_id uuid not null references public.portfolio_items(id) on delete cascade,
  dimension_result_id uuid not null references public.claim_dimension_results(id) on delete cascade,
  dimension text not null check (
    dimension in (
      'identity_control', 'project_or_activity_exists', 'account_or_asset_control',
      'authorship_or_contribution', 'role', 'dates_and_duration',
      'organization_relationship', 'award_or_credential', 'output_or_deliverable',
      'impact_or_outcome', 'third_party_confirmation'
    )
  ),
  actor_type text not null check (actor_type in ('student', 'verifier', 'reviewer', 'system')),
  previous_status text check (
    previous_status is null or previous_status in (
      'not_checked', 'unable_to_verify', 'partially_supported',
      'strongly_supported', 'externally_confirmed', 'needs_review'
    )
  ),
  new_status text not null check (
    new_status in (
      'not_checked', 'unable_to_verify', 'partially_supported',
      'strongly_supported', 'externally_confirmed', 'needs_review'
    )
  ),
  reason text check (reason is null or length(reason) <= 2000),
  created_at timestamptz not null default now()
);

comment on table public.claim_dimension_events is
  'Immutable audit trail for claim_dimension_results — insert-only for every role, including the owning student. See docs/security.md (Milestone 10.7).';

create index if not exists claim_dimension_events_user_idx
  on public.claim_dimension_events (user_id);

create index if not exists claim_dimension_events_result_idx
  on public.claim_dimension_events (dimension_result_id, created_at);

create index if not exists claim_dimension_events_item_idx
  on public.claim_dimension_events (portfolio_item_id);

alter table public.claim_dimension_events enable row level security;

create policy "Users can view their own claim dimension events"
  on public.claim_dimension_events for select
  to authenticated
  using (auth.uid() = user_id);

-- Students may only ever log events as themselves, and only the one status
-- a student is allowed to self-report (see src/lib/claims/dimension-level.ts:
-- 'partially_supported'); every verifier/reviewer/other-system transition is
-- written by a service-role connection instead, which bypasses RLS and so
-- needs no policy of its own here — same split as verification_events.
create policy "Users can log their own claim dimension events"
  on public.claim_dimension_events for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and actor_type = 'student'
    and new_status = 'partially_supported'
    and exists (
      select 1 from public.claim_dimension_results cdr
      where cdr.id = dimension_result_id and cdr.user_id = auth.uid() and cdr.portfolio_item_id = portfolio_item_id
    )
  );

-- No update or delete policy on this table for any role — see the table
-- comment above.

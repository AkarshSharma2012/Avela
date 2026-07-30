-- Milestone 10.9 — Avela Passport: universal evidence lifecycle, no-login
-- school review links, and richer external confirmation requests.
--
-- Purely additive on top of the existing portfolio/evidence/verification/
-- claims schema (Milestones 10-10.8). Nothing here changes the meaning of
-- an existing column, backfills a value, or removes a policy. Reuses the
-- same hashed-token pattern as portfolio_verifications.verification_code_hash
-- (see src/lib/verification/tokens.ts) rather than inventing a second one.

-- ---------------------------------------------------------------------------
-- portfolio_files — universal evidence lifecycle (spec Part 3)
-- ---------------------------------------------------------------------------
--
-- evidence_role (Milestone 10.7/10.8) already answers "what kind of evidence
-- is this" (23 values, incl. code_or_source, publication, official_result,
-- possession_or_control). What's missing is (a) how the artifact arrived and
-- (b) whether it's been readable/analyzable — that's what these three
-- columns add. 'unknown' is always a valid source_kind and
-- 'unsupported_for_automatic_analysis' is always a valid extraction_status —
-- nothing is ever rejected merely because Avela can't automatically read it.

alter table public.portfolio_files
  add column if not exists source_kind text,
  add column if not exists extraction_status text not null default 'received',
  add column if not exists visibility text not null default 'private';

alter table public.portfolio_files
  drop constraint if exists portfolio_files_source_kind_check;

alter table public.portfolio_files
  add constraint portfolio_files_source_kind_check check (
    source_kind is null or source_kind in (
      'public_url', 'private_url', 'git_repository', 'live_website',
      'image', 'screenshot', 'process_image', 'pdf', 'plain_text',
      'document', 'presentation', 'certificate', 'competition_result',
      'official_result_page', 'audio_link', 'video_link', 'audio_upload',
      'video_upload', 'design_file', 'prototype_file', 'research_paper',
      'research_poster', 'publication', 'school_page', 'organization_page',
      'portfolio_page', 'recommendation', 'reviewer_confirmation',
      'email_confirmation', 'student_explanation', 'possession_challenge',
      'manual_offline', 'unknown'
    )
  );

alter table public.portfolio_files
  drop constraint if exists portfolio_files_extraction_status_check;

alter table public.portfolio_files
  add constraint portfolio_files_extraction_status_check check (
    extraction_status in (
      'received', 'stored', 'extraction_pending', 'readable',
      'partially_readable', 'unsupported_for_automatic_analysis',
      'relevant', 'irrelevant', 'supports_claim', 'independently_confirmed',
      'needs_review', 'extraction_failed', 'metadata_only'
    )
  );

alter table public.portfolio_files
  drop constraint if exists portfolio_files_visibility_check;

alter table public.portfolio_files
  add constraint portfolio_files_visibility_check check (
    visibility in ('private', 'summary_only', 'shared')
  );

comment on column public.portfolio_files.source_kind is
  'How this evidence arrived (spec Part 3) — null on pre-Milestone-10.9 rows, never required. ''unknown'' is always valid; nothing is rejected for being an unrecognized evidence type.';
comment on column public.portfolio_files.extraction_status is
  'Honest lifecycle state — ''unsupported_for_automatic_analysis'' and ''metadata_only'' are first-class states, never hidden or misrepresented as full analysis. Defaults to ''received'' so every pre-existing row is valid without a backfill.';
comment on column public.portfolio_files.visibility is
  'Student-controlled sharing default for this artifact (Part 1 Card 4). Defaults to ''private'' — sensitive uploads are never shared by default.';

-- ---------------------------------------------------------------------------
-- portfolio_review_links — private, no-login, revocable school review (Part 9)
-- ---------------------------------------------------------------------------
--
-- A student selects specific items (and, per item, specific evidence files)
-- and gets one shareable, unguessable link. The link itself grants no
-- Supabase session — reviewer reads happen through a narrowly-scoped server
-- action using a service-role connection (src/lib/review-links/repository.ts),
-- exactly like the existing verifier-confirms-a-claim flow
-- (src/lib/verification/repository.ts). RLS below only ever governs the
-- owning student's own authenticated access (create/list/revoke), never the
-- anonymous reviewer's read.

create table if not exists public.portfolio_review_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) > 0 and length(title) <= 200),
  intro_summary text check (intro_summary is null or length(intro_summary) <= 2000),
  -- sha256 hex digest only — the raw token is never persisted, same as
  -- portfolio_verifications.verification_code_hash.
  token_hash text not null unique check (length(token_hash) = 64),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer not null default 0 check (view_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.portfolio_review_links is
  'A private, revocable, no-login link to a student-selected subset of their portfolio. Reviewer access is read-only and never touches the rest of the student''s account. See docs/security.md (Milestone 10.9).';

create index if not exists portfolio_review_links_user_idx
  on public.portfolio_review_links (user_id);

create index if not exists portfolio_review_links_token_hash_idx
  on public.portfolio_review_links (token_hash);

create index if not exists portfolio_review_links_expires_idx
  on public.portfolio_review_links (expires_at);

drop trigger if exists portfolio_review_links_set_updated_at on public.portfolio_review_links;

create trigger portfolio_review_links_set_updated_at
before update on public.portfolio_review_links
for each row
execute function public.set_updated_at();

alter table public.portfolio_review_links enable row level security;

create policy "Users can view their own review links"
  on public.portfolio_review_links for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create their own review links"
  on public.portfolio_review_links for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Revoking is the only client-facing update (setting revoked_at) — enforced
-- at the app layer (src/lib/review-links/actions.ts), RLS only guarantees a
-- student can never touch another student's link.
create policy "Users can update their own review links"
  on public.portfolio_review_links for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own review links"
  on public.portfolio_review_links for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- portfolio_review_link_items — which items (and which evidence) are shared
-- ---------------------------------------------------------------------------

create table if not exists public.portfolio_review_link_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  review_link_id uuid not null references public.portfolio_review_links(id) on delete cascade,
  portfolio_item_id uuid not null references public.portfolio_items(id) on delete cascade,
  -- Empty array = no files explicitly selected (summary-only sharing); a
  -- non-empty array is always re-verified server-side to belong to both this
  -- student and this item before ever being rendered to a reviewer.
  selected_file_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint portfolio_review_link_items_unique unique (review_link_id, portfolio_item_id)
);

comment on table public.portfolio_review_link_items is
  'Which portfolio items (and which specific evidence files) one review link exposes. Selecting an item here never exposes any other item or the rest of the account. See docs/security.md (Milestone 10.9).';

create index if not exists portfolio_review_link_items_user_idx
  on public.portfolio_review_link_items (user_id);

create index if not exists portfolio_review_link_items_link_idx
  on public.portfolio_review_link_items (review_link_id);

alter table public.portfolio_review_link_items enable row level security;

create policy "Users can view their own review link items"
  on public.portfolio_review_link_items for select
  to authenticated
  using (auth.uid() = user_id);

-- Reverifies the link and the item both belong to the caller — same
-- defense-in-depth double-check application_evidence_links' insert policy
-- uses for two owner-scoped foreign references.
create policy "Users can add items to their own review links"
  on public.portfolio_review_link_items for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.portfolio_review_links rl where rl.id = review_link_id and rl.user_id = auth.uid())
    and exists (select 1 from public.portfolio_items pi where pi.id = portfolio_item_id and pi.user_id = auth.uid())
  );

create policy "Users can remove items from their own review links"
  on public.portfolio_review_link_items for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- portfolio_confirmation_requests — frictionless external confirmation (Part 10)
-- ---------------------------------------------------------------------------
--
-- A narrower, richer sibling of portfolio_verifications: scoped to one or
-- more specific claim dimensions (never "confirm this entire item"), with
-- five response options instead of the older confirm/decline binary. Reuses
-- the same hashed-token shape; the anonymous reviewer's response is written
-- by a service-role server action (src/lib/confirmations/actions.ts),
-- mirroring confirmVerifierClaim in src/lib/verification/actions.ts.

create table if not exists public.portfolio_confirmation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_item_id uuid not null references public.portfolio_items(id) on delete cascade,
  -- The specific dimensions this reviewer is being asked about — never the
  -- whole item. Validated against ALL_CLAIM_DIMENSIONS at the app layer
  -- (src/lib/claims/constants.ts); the DB only guarantees the array is
  -- non-empty.
  claim_dimensions text[] not null check (array_length(claim_dimensions, 1) > 0),
  reviewer_role text not null check (
    reviewer_role in (
      'teacher', 'counselor', 'coach', 'employer', 'mentor',
      'organization_leader', 'teammate', 'community_member', 'parent_or_guardian'
    )
  ),
  -- Reviewer email stays private by default (spec Part 10) — collected only
  -- if the student chooses to enter one for their own reference, never
  -- surfaced to anyone else and never included in analytics.
  reviewer_email text check (
    reviewer_email is null or (length(reviewer_email) <= 320 and reviewer_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  ),
  reviewer_display_name text check (reviewer_display_name is null or length(reviewer_display_name) <= 200),
  student_context_note text check (student_context_note is null or length(student_context_note) <= 1000),
  token_hash text not null unique check (length(token_hash) = 64),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  responded_at timestamptz,
  response_status text check (
    response_status is null or response_status in (
      'can_confirm', 'can_confirm_participation_only', 'mostly_accurate', 'cannot_verify'
    )
  ),
  response_note text check (response_note is null or length(response_note) <= 1000),
  -- Simple fixed-window rate-limit bookkeeping (Part 10/14) — one row's
  -- attempt count, reset is not needed since a request is single-use once
  -- responded_at is set.
  attempt_count integer not null default 0 check (attempt_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.portfolio_confirmation_requests is
  'A no-login request asking one named-role reviewer to confirm specific claim dimensions of one portfolio item, in under ~20 seconds. Never proves every claim on the item, and confirmation is not treated as a database-of-record fact — see src/lib/claims/repository.ts for how a response maps back to claim_dimension_results. See docs/security.md (Milestone 10.9).';

create index if not exists portfolio_confirmation_requests_user_idx
  on public.portfolio_confirmation_requests (user_id);

create index if not exists portfolio_confirmation_requests_token_hash_idx
  on public.portfolio_confirmation_requests (token_hash);

create index if not exists portfolio_confirmation_requests_item_idx
  on public.portfolio_confirmation_requests (portfolio_item_id);

create index if not exists portfolio_confirmation_requests_expires_idx
  on public.portfolio_confirmation_requests (expires_at);

drop trigger if exists portfolio_confirmation_requests_set_updated_at on public.portfolio_confirmation_requests;

create trigger portfolio_confirmation_requests_set_updated_at
before update on public.portfolio_confirmation_requests
for each row
execute function public.set_updated_at();

alter table public.portfolio_confirmation_requests enable row level security;

create policy "Users can view their own confirmation requests"
  on public.portfolio_confirmation_requests for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create their own confirmation requests"
  on public.portfolio_confirmation_requests for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.portfolio_items pi where pi.id = portfolio_item_id and pi.user_id = auth.uid())
  );

-- Students may only ever revoke (set revoked_at) their own request from the
-- client — the reviewer's response_status/responded_at/attempt_count writes
-- always go through the service-role connection, bypassing RLS, same split
-- as portfolio_verifications' confirm/decline flow.
create policy "Users can revoke their own confirmation requests"
  on public.portfolio_confirmation_requests for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No delete policy: a confirmation request's audit trail (including a
-- reviewer's response) survives until the portfolio item itself is removed,
-- same reasoning as portfolio_verifications.

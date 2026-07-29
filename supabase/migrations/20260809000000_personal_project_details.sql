-- Milestone 10.7 — Personal/Physical/Creative Project Flow.
--
-- Makes the portfolio work for offline, physical, and creative projects,
-- not just linkable/checkable ones (spec section 7). Three additive
-- changes:
--
--   1. portfolio_personal_project_details — the short-prompt structured
--      narrative (spec section 6): three required one-or-two-sentence
--      answers, several optional ones. Never a long essay requirement.
--   2. portfolio_files gains evidence_role and content_hash — what kind of
--      evidence a file is (a sketch vs. a final photo vs. a process log),
--      and a hash for cross-claim duplicate detection (spec section 7's
--      weak image-integrity signals). Both nullable — every existing file
--      row is unaffected.
--   3. portfolio_possession_challenges — the physical-artifact "photograph
--      it with a short-lived code visible" flow (spec section 7). Hash-only
--      storage, same shape as identity_possession_challenges but scoped to
--      a portfolio item rather than an external account, since there is no
--      OCR/vision connector in this codebase to auto-read the code from a
--      photo — confirmation is always a respectful human (reviewer) step,
--      never automatic, which is exactly why the student's own session can
--      never set status = 'confirmed' (see the update policy below).

create table if not exists public.portfolio_personal_project_details (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_item_id uuid not null references public.portfolio_items(id) on delete cascade,
  -- Required — but short: "1-2 sentences," enforced at the application
  -- layer (personal-project.ts), not by a minimum-length check here, since
  -- the spec's rule is "don't reward word count," not "require a lot of it."
  what_you_made text not null check (length(what_you_made) between 1 and 600),
  why_you_made_it text not null check (length(why_you_made_it) between 1 and 600),
  your_part text not null check (length(your_part) between 1 and 600),
  -- Optional prompts (spec section 6) — every one nullable.
  made_for text check (made_for is null or length(made_for) <= 400),
  problem_or_goal text check (problem_or_goal is null or length(problem_or_goal) <= 600),
  tools_or_materials text check (tools_or_materials is null or length(tools_or_materials) <= 600),
  difficult_or_interesting text check (difficult_or_interesting is null or length(difficult_or_interesting) <= 600),
  result text check (result is null or length(result) <= 600),
  improvement_ideas text check (improvement_ideas is null or length(improvement_ideas) <= 600),
  collaborators text check (collaborators is null or length(collaborators) <= 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolio_personal_project_details_one_per_item unique (portfolio_item_id)
);

comment on table public.portfolio_personal_project_details is
  'Short structured narrative for a personal/physical/creative project — three required 1-2 sentence answers, several optional. See docs/security.md (Milestone 10.7).';

create index if not exists portfolio_personal_project_details_user_idx
  on public.portfolio_personal_project_details (user_id);

drop trigger if exists portfolio_personal_project_details_set_updated_at on public.portfolio_personal_project_details;

create trigger portfolio_personal_project_details_set_updated_at
before update on public.portfolio_personal_project_details
for each row
execute function public.set_updated_at();

alter table public.portfolio_personal_project_details enable row level security;

create policy "Users can view their own personal project details"
  on public.portfolio_personal_project_details for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create their own personal project details"
  on public.portfolio_personal_project_details for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.portfolio_items pi where pi.id = portfolio_item_id and pi.user_id = auth.uid())
  );

create policy "Users can update their own personal project details"
  on public.portfolio_personal_project_details for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No delete policy — same "state update, not a row delete" convention as
-- every other student-owned table in this codebase.

-- ---------------------------------------------------------------------------
-- portfolio_files: evidence_role + content_hash
-- ---------------------------------------------------------------------------

alter table public.portfolio_files
  add column if not exists evidence_role text check (
    evidence_role is null or evidence_role in (
      'concept_or_plan', 'sketch_or_draft', 'materials_or_tools', 'work_in_progress',
      'final_artifact', 'demonstration', 'reflection', 'collaborator_confirmation',
      'supervisor_confirmation', 'customer_or_recipient_confirmation', 'event_or_display',
      'receipt_or_material_record', 'process_log', 'other'
    )
  );

comment on column public.portfolio_files.evidence_role is
  'What kind of evidence this file is (spec section 7) — supports authorship/process claims for offline and physical work. Null = not classified (every pre-Milestone-10.7 file).';

-- sha256 hex digest of the file's bytes — exact-duplicate detection across
-- a student's own claims (spec section 7/9: "reusing the same document,
-- image, certificate, or URL"). A match is never blocking, only a
-- respectful "this may also appear elsewhere" note (see image-integrity.ts).
alter table public.portfolio_files
  add column if not exists content_hash text check (content_hash is null or length(content_hash) = 64);

create index if not exists portfolio_files_content_hash_idx
  on public.portfolio_files (content_hash)
  where content_hash is not null;

-- ---------------------------------------------------------------------------
-- portfolio_possession_challenges (physical-artifact variant)
-- ---------------------------------------------------------------------------

create table if not exists public.portfolio_possession_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_item_id uuid not null references public.portfolio_items(id) on delete cascade,
  challenge_token_hash text not null check (length(challenge_token_hash) = 64),
  evidence_file_id uuid references public.portfolio_files(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'expired', 'revoked')),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.portfolio_possession_challenges is
  'Physical-artifact possession challenges — proves current possession only, never authorship. Confirmation always requires a reviewer (no OCR/vision connector exists), so a client session can never set status to confirmed. See docs/security.md (Milestone 10.7).';

create index if not exists portfolio_possession_challenges_user_idx
  on public.portfolio_possession_challenges (user_id);

create index if not exists portfolio_possession_challenges_item_idx
  on public.portfolio_possession_challenges (portfolio_item_id);

drop trigger if exists portfolio_possession_challenges_set_updated_at on public.portfolio_possession_challenges;

create trigger portfolio_possession_challenges_set_updated_at
before update on public.portfolio_possession_challenges
for each row
execute function public.set_updated_at();

alter table public.portfolio_possession_challenges enable row level security;

create policy "Users can view their own possession challenges"
  on public.portfolio_possession_challenges for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create their own possession challenges"
  on public.portfolio_possession_challenges for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.portfolio_items pi where pi.id = portfolio_item_id and pi.user_id = auth.uid())
  );

-- A student may attach evidence or self-cancel (expired/revoked), but can
-- never flip status to 'confirmed' from their own session — that always
-- requires a reviewer, through a service-role connection (see
-- src/lib/portfolio/possession-challenge.ts), which bypasses this policy
-- entirely and needs no policy of its own here.
create policy "Users can update their own possession challenges but never self-confirm"
  on public.portfolio_possession_challenges for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and status in ('pending', 'expired', 'revoked')
    and (
      evidence_file_id is null
      or exists (select 1 from public.portfolio_files pf where pf.id = evidence_file_id and pf.user_id = auth.uid())
    )
  );

-- No delete policy — an expired/revoked challenge stays as a row.

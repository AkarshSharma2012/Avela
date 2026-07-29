-- Milestone 10.8 — Universal Entry Narrative & Team-Project Details.
--
-- Two additive, independent additions supporting the low-friction universal
-- entry flow (spec sections 3 and 12):
--
--   1. portfolio_entry_narrative — the universal three-required-prompt
--      narrative ("what did you do or make," "why did you do it," "what
--      part did you personally complete") plus the spec's seven optional
--      prompts, for *every* project context going forward, not just
--      personal/physical projects. A deliberate new sibling table, not a
--      rework of portfolio_personal_project_details (Milestone 10.7,
--      tested and committed) — that table keeps serving exactly the rows
--      it already serves, untouched. See src/lib/portfolio/entry-narrative.ts
--      for the read path that checks this table first and falls back to
--      portfolio_personal_project_details for pre-existing rows.
--   2. portfolio_team_details + portfolio_team_collaborators — team size,
--      the student's own role, personal contribution kept separate from
--      overall team output, and an optional collaborator list that never
--      requires an email and is never exposed publicly (spec section 12:
--      "team output does not confirm individual contribution," "one small
--      contribution does not prove sole creation").

-- ---------------------------------------------------------------------------
-- portfolio_entry_narrative
-- ---------------------------------------------------------------------------

create table if not exists public.portfolio_entry_narrative (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_item_id uuid not null references public.portfolio_items(id) on delete cascade,
  -- Required — short by design, enforced at the application layer
  -- (entry-narrative.ts), not by a minimum length here, matching
  -- portfolio_personal_project_details's "don't reward word count" rule.
  what_you_did text not null check (length(what_you_did) between 1 and 600),
  why_you_did_it text not null check (length(why_you_did_it) between 1 and 600),
  your_part text not null check (length(your_part) between 1 and 600),
  -- Optional prompts (spec section 3) — every one nullable.
  who_it_helped text check (who_it_helped is null or length(who_it_helped) <= 400),
  materials_or_tools text check (materials_or_tools is null or length(materials_or_tools) <= 600),
  collaborators text check (collaborators is null or length(collaborators) <= 400),
  challenges text check (challenges is null or length(challenges) <= 600),
  result text check (result is null or length(result) <= 600),
  what_you_learned text check (what_you_learned is null or length(what_you_learned) <= 600),
  would_improve text check (would_improve is null or length(would_improve) <= 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolio_entry_narrative_one_per_item unique (portfolio_item_id)
);

comment on table public.portfolio_entry_narrative is
  'Universal short structured narrative for any activity, any project context — three required 1-2 sentence answers, seven optional. See docs/security.md (Milestone 10.8).';

create index if not exists portfolio_entry_narrative_user_idx
  on public.portfolio_entry_narrative (user_id);

drop trigger if exists portfolio_entry_narrative_set_updated_at on public.portfolio_entry_narrative;

create trigger portfolio_entry_narrative_set_updated_at
before update on public.portfolio_entry_narrative
for each row
execute function public.set_updated_at();

alter table public.portfolio_entry_narrative enable row level security;

create policy "Users can view their own entry narrative"
  on public.portfolio_entry_narrative for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create their own entry narrative"
  on public.portfolio_entry_narrative for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.portfolio_items pi where pi.id = portfolio_item_id and pi.user_id = auth.uid())
  );

create policy "Users can update their own entry narrative"
  on public.portfolio_entry_narrative for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No delete policy — same "state update, not a row delete" convention as
-- portfolio_personal_project_details.

-- ---------------------------------------------------------------------------
-- portfolio_team_details
-- ---------------------------------------------------------------------------

create table if not exists public.portfolio_team_details (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_item_id uuid not null references public.portfolio_items(id) on delete cascade,
  team_size integer check (team_size is null or (team_size >= 1 and team_size <= 1000)),
  student_role text check (student_role is null or length(student_role) <= 200),
  -- Kept as two explicitly separate fields, never merged into one — the
  -- whole point (spec section 12) is that team_output never stands in for
  -- personal_contribution, and neither is ever read as proof of the other.
  team_output text check (team_output is null or length(team_output) <= 2000),
  personal_contribution text check (personal_contribution is null or length(personal_contribution) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolio_team_details_one_per_item unique (portfolio_item_id)
);

comment on table public.portfolio_team_details is
  'Team-project context for one portfolio item — team output and personal contribution recorded separately, never merged. See docs/security.md (Milestone 10.8).';

create index if not exists portfolio_team_details_user_idx
  on public.portfolio_team_details (user_id);

drop trigger if exists portfolio_team_details_set_updated_at on public.portfolio_team_details;

create trigger portfolio_team_details_set_updated_at
before update on public.portfolio_team_details
for each row
execute function public.set_updated_at();

alter table public.portfolio_team_details enable row level security;

create policy "Users can view their own team details"
  on public.portfolio_team_details for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create their own team details"
  on public.portfolio_team_details for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.portfolio_items pi where pi.id = portfolio_item_id and pi.user_id = auth.uid())
  );

create policy "Users can update their own team details"
  on public.portfolio_team_details for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No delete policy — same "state update, not a row delete" convention.

-- ---------------------------------------------------------------------------
-- portfolio_team_collaborators
-- ---------------------------------------------------------------------------
--
-- A small, freely-editable list a student maintains themselves — unlike the
-- narrative/details tables above, this one does get a delete policy (same
-- shape as portfolio_files: a removable list item, not durable state).
-- email is optional and, when present, never surfaced to anyone but the
-- owning student (spec section 12: "no collaborator email required for
-- basic use," "no public collaborator information").

create table if not exists public.portfolio_team_collaborators (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_item_id uuid not null references public.portfolio_items(id) on delete cascade,
  name text not null check (length(trim(name)) > 0 and length(name) <= 200),
  email text check (email is null or length(email) <= 320),
  role text check (role is null or length(role) <= 200),
  created_at timestamptz not null default now()
);

comment on table public.portfolio_team_collaborators is
  'A student-maintained list of collaborators on a team item — name only is required; email/role are optional and never exposed to anyone but the owning student. See docs/security.md (Milestone 10.8).';

create index if not exists portfolio_team_collaborators_user_idx
  on public.portfolio_team_collaborators (user_id);

create index if not exists portfolio_team_collaborators_item_idx
  on public.portfolio_team_collaborators (portfolio_item_id);

alter table public.portfolio_team_collaborators enable row level security;

create policy "Users can view their own team collaborators"
  on public.portfolio_team_collaborators for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can add collaborators to their own team items"
  on public.portfolio_team_collaborators for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.portfolio_items pi where pi.id = portfolio_item_id and pi.user_id = auth.uid())
  );

create policy "Users can update their own team collaborators"
  on public.portfolio_team_collaborators for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can remove their own team collaborators"
  on public.portfolio_team_collaborators for delete
  to authenticated
  using (auth.uid() = user_id);

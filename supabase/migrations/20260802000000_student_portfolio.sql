-- Student Portfolio & Evidence Vault: a private workspace where a student
-- collects, organizes, and reuses application evidence (activities, awards,
-- projects, files, links, etc.), then attaches pieces of it to whichever
-- application(s) actually need them.
--
-- Three new, additive-only tables, every one owner-only (RLS scoped to
-- `auth.uid() = user_id`), plus a private Supabase Storage bucket for the
-- files themselves. Mirrors the `application_plans`/`application_tasks`
-- pattern throughout: real Postgres columns, no duplication of data that
-- already lives elsewhere, cross-owner checks reverified at the RLS layer
-- wherever a row references another owner-scoped row.

-- ---------------------------------------------------------------------------
-- portfolio_items
-- ---------------------------------------------------------------------------

create table if not exists public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (
    item_type in (
      'activity', 'award', 'project', 'leadership', 'volunteer_service',
      'work_experience', 'course', 'certification', 'skill',
      'essay_response', 'recommendation_contact', 'document', 'link', 'custom'
    )
  ),
  title text not null check (length(trim(title)) > 0 and length(title) <= 200),
  organization text check (organization is null or length(organization) <= 200),
  description text check (description is null or length(description) <= 5000),
  start_date date,
  end_date date,
  is_current boolean not null default false,
  hours_per_week numeric check (hours_per_week is null or (hours_per_week >= 0 and hours_per_week <= 168)),
  weeks_per_year numeric check (weeks_per_year is null or (weeks_per_year >= 0 and weeks_per_year <= 52)),
  role text check (role is null or length(role) <= 200),
  -- Factual result/impact, in the student's own words — the resume-summary
  -- functions (src/lib/portfolio/summary.ts) only ever surface what's
  -- actually written here, never an invented outcome.
  outcome text check (outcome is null or length(outcome) <= 2000),
  skills text[] not null default '{}',
  tags text[] not null default '{}',
  url text check (url is null or length(url) <= 2000),
  -- "archived" is the student-facing "hide" action (spec section 3) — never
  -- a delete. Hidden items are excluded from the Portfolio Center's default
  -- view and from resume-summary output, but still exist and can be
  -- restored, and any evidence link already attached to one keeps working.
  visibility text not null default 'visible' check (visibility in ('visible', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- An item marked "still doing this" can't also have a fixed end date —
  -- the toggle and the date are mutually exclusive, not just a UI nicety.
  constraint portfolio_items_current_no_end check (not is_current or end_date is null),
  constraint portfolio_items_date_order check (
    start_date is null or end_date is null or end_date >= start_date
  )
);

comment on table public.portfolio_items is
  'A student''s private evidence library — one row per activity/award/project/etc. Never shown to another student; only ever read via the owning student''s own session. See docs/security.md (Milestone 10).';

create index if not exists portfolio_items_user_idx
  on public.portfolio_items (user_id);

create index if not exists portfolio_items_user_type_idx
  on public.portfolio_items (user_id, item_type);

create index if not exists portfolio_items_user_visibility_idx
  on public.portfolio_items (user_id, visibility);

create index if not exists portfolio_items_tags_idx
  on public.portfolio_items using gin (tags);

drop trigger if exists portfolio_items_set_updated_at on public.portfolio_items;

create trigger portfolio_items_set_updated_at
before update on public.portfolio_items
for each row
execute function public.set_updated_at();

alter table public.portfolio_items enable row level security;

create policy "Users can view their own portfolio items"
  on public.portfolio_items for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create their own portfolio items"
  on public.portfolio_items for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own portfolio items"
  on public.portfolio_items for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own portfolio items"
  on public.portfolio_items for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- portfolio_files
-- ---------------------------------------------------------------------------

create table if not exists public.portfolio_files (
  id uuid primary key default gen_random_uuid(),
  -- Denormalized the same way application_tasks.user_id is — what RLS
  -- scopes against directly, without a join back through portfolio_items.
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Nullable: a file can be uploaded before it's attached to a specific
  -- item (e.g. a resume kept "on file"), same way saved_opportunities has
  -- no required application_plan_id. on delete cascade — see
  -- src/lib/portfolio/actions.ts for why the Storage object itself is
  -- removed *before* this row (Postgres cascade has no reach into Storage).
  portfolio_item_id uuid references public.portfolio_items(id) on delete cascade,
  -- Never client-chosen — see src/lib/portfolio/storage.ts's
  -- buildStoragePath(). Always "<user_id>/<item_id-or-unfiled>/<random>.<ext>".
  storage_path text not null check (length(storage_path) > 0 and length(storage_path) <= 512),
  original_filename text not null check (length(trim(original_filename)) > 0 and length(original_filename) <= 255),
  -- Defense-in-depth allowlist mirroring src/lib/portfolio/constants.ts's
  -- ALLOWED_PORTFOLIO_MIME_TYPES — the actual enforcement is server-side
  -- (never trusts a client-supplied MIME type without checking it), this is
  -- a backstop against any write path that skips that check.
  mime_type text not null check (
    mime_type in (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg'
    )
  ),
  -- A generous hard ceiling (20MB), independent of the app's own tighter,
  -- easily-changed configurable limit (10MB — see
  -- src/lib/portfolio/constants.ts) so this constraint never has to move in
  -- lockstep with that constant.
  file_size integer not null check (file_size > 0 and file_size <= 20971520),
  label text check (label is null or length(label) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.portfolio_files is
  'Metadata for files stored in the private "student-portfolio" Supabase Storage bucket. storage_path is a server-generated, per-user-prefixed path — never a client-supplied string. Actual file bytes are only ever reached through a short-lived signed URL, never a public one. See docs/security.md (Milestone 10).';

create index if not exists portfolio_files_user_idx
  on public.portfolio_files (user_id);

create index if not exists portfolio_files_item_idx
  on public.portfolio_files (portfolio_item_id);

drop trigger if exists portfolio_files_set_updated_at on public.portfolio_files;

create trigger portfolio_files_set_updated_at
before update on public.portfolio_files
for each row
execute function public.set_updated_at();

alter table public.portfolio_files enable row level security;

create policy "Users can view their own portfolio files"
  on public.portfolio_files for select
  to authenticated
  using (auth.uid() = user_id);

-- Insert/update reverify that a non-null portfolio_item_id actually belongs
-- to the same student — defense-in-depth on top of the app layer
-- (src/lib/portfolio/repository.ts) always resolving the item by
-- (id, session user id) first, so a file row can never end up attached to
-- another student's item even if a client sent a foreign
-- portfolio_item_id alongside their own, real user_id.
create policy "Users can attach files to their own portfolio items"
  on public.portfolio_files for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (
      portfolio_item_id is null
      or exists (
        select 1 from public.portfolio_items pi
        where pi.id = portfolio_item_id and pi.user_id = auth.uid()
      )
    )
  );

create policy "Users can update their own portfolio files"
  on public.portfolio_files for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      portfolio_item_id is null
      or exists (
        select 1 from public.portfolio_items pi
        where pi.id = portfolio_item_id and pi.user_id = auth.uid()
      )
    )
  );

create policy "Users can delete their own portfolio files"
  on public.portfolio_files for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- application_evidence_links
-- ---------------------------------------------------------------------------

create table if not exists public.application_evidence_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_plan_id uuid not null references public.application_plans(id) on delete cascade,
  portfolio_item_id uuid not null references public.portfolio_items(id) on delete cascade,
  evidence_purpose text not null check (
    evidence_purpose in (
      'resume', 'essay', 'recommendation', 'transcript', 'award_proof',
      'project_sample', 'eligibility_proof', 'other'
    )
  ),
  notes text check (notes is null or length(notes) <= 1000),
  created_at timestamptz not null default now(),
  -- The same portfolio item can serve two different purposes on the same
  -- application (e.g. both "resume" and "project_sample"), but never the
  -- same (application, item, purpose) combination twice.
  unique (application_plan_id, portfolio_item_id, evidence_purpose)
);

comment on table public.application_evidence_links is
  'Attaches a portfolio_items row to an application_plans row for a specific purpose (resume, essay, etc.) — never a copy of the evidence itself, only a reference. See docs/decision-log.md (Milestone 10).';

create index if not exists application_evidence_links_user_idx
  on public.application_evidence_links (user_id);

create index if not exists application_evidence_links_plan_idx
  on public.application_evidence_links (application_plan_id);

create index if not exists application_evidence_links_item_idx
  on public.application_evidence_links (portfolio_item_id);

alter table public.application_evidence_links enable row level security;

create policy "Users can view their own evidence links"
  on public.application_evidence_links for select
  to authenticated
  using (auth.uid() = user_id);

-- Reverifies both the plan and the item belong to the same student — the
-- exact same defense-in-depth pattern application_tasks' insert policy
-- uses, applied twice (once per foreign reference) since this row links two
-- other owner-scoped tables together.
create policy "Users can attach evidence to their own applications"
  on public.application_evidence_links for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.application_plans p
      where p.id = application_plan_id and p.user_id = auth.uid()
    )
    and exists (
      select 1 from public.portfolio_items pi
      where pi.id = portfolio_item_id and pi.user_id = auth.uid()
    )
  );

create policy "Users can remove their own evidence links"
  on public.application_evidence_links for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Supabase Storage — private "student-portfolio" bucket
-- ---------------------------------------------------------------------------

-- Private (public = false): the only way to read a file's bytes is a
-- short-lived signed URL created server-side after an ownership check (see
-- src/lib/portfolio/storage.ts's createPortfolioFileSignedUrl()), never a
-- public/CDN URL. file_size_limit/allowed_mime_types are a first line of
-- defense at the Storage layer itself; the authoritative check is still the
-- server-side validation every upload goes through before this bucket is
-- ever touched (src/lib/portfolio/validation.ts).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-portfolio',
  'student-portfolio',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Every object's path is "<user_id>/<item_id-or-'unfiled'>/<random-filename>"
-- (buildStoragePath() in storage.ts) — (storage.foldername(name))[1] is
-- always that leading <user_id> segment, so these four policies are the
-- entire access-control story for the bucket: a student can act only on
-- objects under their own uid prefix, full stop. No policy exists for any
-- other path shape, and no policy grants access to the `anon` role.
create policy "Portfolio owners can view their own files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'student-portfolio' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Portfolio owners can upload their own files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'student-portfolio' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Portfolio owners can update their own files"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'student-portfolio' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'student-portfolio' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Portfolio owners can delete their own files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'student-portfolio' and (storage.foldername(name))[1] = auth.uid()::text);

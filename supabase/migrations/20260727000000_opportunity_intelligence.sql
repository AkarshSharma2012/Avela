-- Milestone 5: Opportunity Discovery, Verification, and Ranking Engine
--
-- Adds the source registry, raw ingestion layer, and admin review queue
-- needed to discover/verify/normalize/dedupe/rank opportunities instead of
-- only filtering whatever is already in `public.opportunities`, plus the
-- verification/deadline/eligibility/application-status columns that let
-- `opportunities` carry that intelligence per row. No earlier migration is
-- modified. Every new table is RLS-enabled with zero client-facing
-- policies — reads/writes only ever happen through a service-role
-- connection (same convention as `scripts/import-opportunities.ts` in
-- Milestone 4), since raw/source/review data should never reach a student's
-- browser. See docs/database.md for the full write-up.

-- ---------------------------------------------------------------------------
-- opportunity_sources
-- ---------------------------------------------------------------------------

create table if not exists public.opportunity_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  base_url text not null,
  source_type text not null check (source_type in (
    'official_organization', 'government', 'university', 'nonprofit',
    'school_district', 'verified_directory', 'rss_feed', 'api', 'manual_source'
  )),
  -- Coarse three-level scale (not the spec's open-ended "trust level" text)
  -- so quality.ts can treat it as an ordered input rather than parsing
  -- free text. See docs/decision-log.md.
  trust_level text not null default 'medium' check (trust_level in ('high', 'medium', 'low')),
  crawl_method text not null check (crawl_method in (
    'manual_import', 'csv_import', 'rss_feed', 'api', 'static_adapter', 'html_scrape'
  )),
  is_active boolean not null default true,
  requires_javascript boolean not null default false,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.opportunity_sources is
  'Registry of places opportunities are discovered from. Service-role writable only — see scripts/ and src/lib/opportunities/adapters. Never directly editable by students.';

create trigger opportunity_sources_set_updated_at
before update on public.opportunity_sources
for each row
execute function public.set_updated_at();

create index if not exists opportunity_sources_is_active_idx on public.opportunity_sources (is_active);
create index if not exists opportunity_sources_trust_level_idx on public.opportunity_sources (trust_level);

alter table public.opportunity_sources enable row level security;

comment on table public.opportunity_sources is
  'Registry of places opportunities are discovered from. RLS is enabled with zero policies: no client-facing role (including authenticated students) can select/insert/update/delete — only a service-role connection, which bypasses RLS, may touch this table.';

-- ---------------------------------------------------------------------------
-- opportunity_ingestion_runs
-- ---------------------------------------------------------------------------

create table if not exists public.opportunity_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.opportunity_sources (id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  items_found integer not null default 0 check (items_found >= 0),
  items_created integer not null default 0 check (items_created >= 0),
  items_updated integer not null default 0 check (items_updated >= 0),
  items_rejected integer not null default 0 check (items_rejected >= 0),
  error_summary text
);

comment on table public.opportunity_ingestion_runs is
  'One row per discovery/ingestion run against a source. Service-role only — see opportunity_sources comment.';

create index if not exists opportunity_ingestion_runs_source_id_idx
  on public.opportunity_ingestion_runs (source_id);
create index if not exists opportunity_ingestion_runs_status_idx
  on public.opportunity_ingestion_runs (status);

alter table public.opportunity_ingestion_runs enable row level security;

-- ---------------------------------------------------------------------------
-- raw_opportunity_records
--
-- Never shown to students directly (see docs/security.md) — extraction and
-- normalization always sit between this table and public.opportunities.
-- ---------------------------------------------------------------------------

create table if not exists public.raw_opportunity_records (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.opportunity_sources (id) on delete cascade,
  ingestion_run_id uuid not null references public.opportunity_ingestion_runs (id) on delete cascade,
  source_url text not null,
  raw_title text,
  raw_content text not null,
  raw_metadata jsonb not null default '{}'::jsonb,
  content_hash text not null,
  fetched_at timestamptz not null default now(),
  processing_status text not null default 'pending' check (processing_status in (
    'pending', 'processed', 'rejected', 'duplicate'
  )),
  processing_error text
);

comment on table public.raw_opportunity_records is
  'Unprocessed fetch results awaiting extraction/normalization. Never exposed to students — service-role only.';

create index if not exists raw_opportunity_records_source_id_idx
  on public.raw_opportunity_records (source_id);
create index if not exists raw_opportunity_records_ingestion_run_id_idx
  on public.raw_opportunity_records (ingestion_run_id);
create index if not exists raw_opportunity_records_content_hash_idx
  on public.raw_opportunity_records (content_hash);
create index if not exists raw_opportunity_records_processing_status_idx
  on public.raw_opportunity_records (processing_status);

alter table public.raw_opportunity_records enable row level security;

-- ---------------------------------------------------------------------------
-- opportunities — verification/discovery columns
--
-- Additive only: every new column has a safe default so existing (or
-- sample) rows keep working unmodified. `is_active`/`is_verified`/
-- `is_sample` from Milestone 4 are unchanged and still the RLS-level gate;
-- these new columns feed the *application-level* visibility/ranking rules
-- in src/lib/opportunities/query.ts and ranking.ts, layered on top.
-- ---------------------------------------------------------------------------

alter table public.opportunities
  add column if not exists canonical_url text,
  add column if not exists source_id uuid references public.opportunity_sources (id) on delete set null,
  add column if not exists last_verified_at timestamptz,
  add column if not exists next_verification_at timestamptz,
  add column if not exists verification_status text not null default 'unverified' check (
    verification_status in ('unverified', 'partially_verified', 'verified', 'stale', 'rejected')
  ),
  add column if not exists verification_confidence integer not null default 0 check (
    verification_confidence between 0 and 100
  ),
  add column if not exists deadline_status text not null default 'unknown' check (
    deadline_status in ('open', 'rolling', 'upcoming', 'closed', 'unknown')
  ),
  -- Whether *eligibility criteria are known for this listing* (data
  -- completeness) — distinct from a given student's eligibility outcome
  -- (eligible/likely_eligible/unclear/ineligible), which is never stored
  -- since it depends on the student and is computed at request time by
  -- src/lib/opportunities/eligibility-engine.ts. See docs/decision-log.md.
  add column if not exists eligibility_status text not null default 'undefined' check (
    eligibility_status in ('defined', 'partially_defined', 'undefined')
  ),
  add column if not exists application_status text not null default 'unknown' check (
    application_status in ('accepting_applications', 'opening_soon', 'closed', 'unknown')
  ),
  add column if not exists source_last_modified_at timestamptz,
  add column if not exists first_seen_at timestamptz not null default now(),
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists rejection_reason text,
  add column if not exists residency_requirements text,
  add column if not exists citizenship_requirements text,
  add column if not exists eligibility_notes text,
  add column if not exists application_cycle text,
  add column if not exists recurrence_pattern text;

comment on column public.opportunities.verification_status is
  'unverified | partially_verified | verified | stale | rejected — set by the (future) verification pipeline, never inferred from a listing merely existing online.';
comment on column public.opportunities.deadline_status is
  'open | rolling | upcoming | closed | unknown — see src/lib/opportunities/deadline.ts. A page being reachable never implies "open".';
comment on column public.opportunities.eligibility_status is
  'How completely this listing''s eligibility criteria are known: defined | partially_defined | undefined. NOT a per-student eligibility outcome — that is computed per request by eligibility-engine.ts and never stored.';
comment on column public.opportunities.application_status is
  'accepting_applications | opening_soon | closed | unknown — independent of deadline_status (a rolling program can be closed to new applicants; a future deadline can still be "opening_soon").';

create index if not exists opportunities_verification_status_idx on public.opportunities (verification_status);
create index if not exists opportunities_deadline_status_idx on public.opportunities (deadline_status);
create index if not exists opportunities_application_status_idx on public.opportunities (application_status);
create index if not exists opportunities_next_verification_at_idx on public.opportunities (next_verification_at);
create index if not exists opportunities_source_id_idx on public.opportunities (source_id);

-- ---------------------------------------------------------------------------
-- opportunity_source_links
--
-- Lets one canonical opportunity be backed by multiple sources (the
-- deduplication foundation in section 7 of the spec) instead of a second
-- student-facing card per source.
-- ---------------------------------------------------------------------------

create table if not exists public.opportunity_source_links (
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  source_id uuid not null references public.opportunity_sources (id) on delete cascade,
  source_url text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  is_primary boolean not null default false,
  primary key (opportunity_id, source_id)
);

comment on table public.opportunity_source_links is
  'Maps a canonical opportunity to every source that reported it, so duplicates across sources collapse into one card. Service-role only.';

create index if not exists opportunity_source_links_source_id_idx
  on public.opportunity_source_links (source_id);
-- At most one primary source link per opportunity.
create unique index if not exists opportunity_source_links_one_primary_idx
  on public.opportunity_source_links (opportunity_id)
  where is_primary;

alter table public.opportunity_source_links enable row level security;

-- ---------------------------------------------------------------------------
-- opportunity_review_queue (section 14 — admin review foundation)
--
-- Database-backed only; no public dashboard, per the spec ("a secure
-- server-side review script or documented workflow is enough").
-- ---------------------------------------------------------------------------

create table if not exists public.opportunity_review_queue (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.opportunities (id) on delete cascade,
  raw_record_id uuid references public.raw_opportunity_records (id) on delete cascade,
  reason text not null check (reason in (
    'unknown_deadline', 'conflicting_sources', 'probable_duplicate',
    'low_confidence_grade', 'unclear_application_status', 'broken_application_url',
    'stale_source', 'residency_citizenship_ambiguity'
  )),
  details text,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint opportunity_review_queue_target_check check (
    opportunity_id is not null or raw_record_id is not null
  )
);

comment on table public.opportunity_review_queue is
  'Records flagged for human review (ambiguous deadlines, probable duplicates, low-confidence extraction, etc). Service-role only — see src/lib/opportunities/review-queue.ts for the pure functions that decide what belongs here.';

create index if not exists opportunity_review_queue_status_idx
  on public.opportunity_review_queue (status);
create index if not exists opportunity_review_queue_opportunity_id_idx
  on public.opportunity_review_queue (opportunity_id);

alter table public.opportunity_review_queue enable row level security;

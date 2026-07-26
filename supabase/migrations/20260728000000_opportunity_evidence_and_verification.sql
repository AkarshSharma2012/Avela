-- Milestone 7: Source Expansion, Deep Detail Extraction, and Verification
--
-- Additive only, same convention as every migration since Milestone 4: no
-- earlier migration is modified, every new column is nullable or has a safe
-- default. Adds (1) a structured per-field evidence model so a value's
-- provenance is queryable instead of only living in a log line, (2) a
-- granular student-facing verification label distinct from the existing
-- coarse `verification_status` gate, (3) application-status-intelligence
-- columns (open/close timestamps derived from phrase evidence, not just
-- deadline inference), and (4) the long tail of "deep detail extraction"
-- fields from the spec — a handful promoted to real columns because
-- query.ts/ranking.ts/the UI need to filter or sort on them, the rest kept
-- in one `extended_details` jsonb column rather than ~15 more single-use
-- columns (see docs/decision-log.md's Milestone 7 section for why).

-- ---------------------------------------------------------------------------
-- opportunity_sources — one new crawl_method for multi-record listing pages
-- ---------------------------------------------------------------------------

alter table public.opportunity_sources drop constraint if exists opportunity_sources_crawl_method_check;
alter table public.opportunity_sources add constraint opportunity_sources_crawl_method_check
  check (crawl_method in (
    'manual_import', 'csv_import', 'rss_feed', 'api', 'static_adapter', 'html_scrape', 'listing_scrape'
  ));

comment on column public.opportunity_sources.crawl_method is
  'manual_import | csv_import | rss_feed | api | static_adapter | html_scrape | listing_scrape. listing_scrape = an official index/listing page enumerating multiple detail-page URLs (see src/lib/opportunities/adapters/listing-adapter.ts), still one human-vetted source per row, never a broad crawler.';

-- ---------------------------------------------------------------------------
-- opportunities — verification label, status-intelligence, and deep-detail
-- columns
-- ---------------------------------------------------------------------------

alter table public.opportunities
  -- Granular, student-facing label — kept separate from verification_status
  -- (the existing coarse gate query.ts already filters on) for the same
  -- reason verification_confidence reuses quality.ts's score without
  -- verification_status reusing its label (see Milestone 6's decision log):
  -- widening one enum's meaning out from under code that already depends on
  -- its current values is riskier than adding a second, more expressive
  -- column that only new code reads.
  add column if not exists verification_label text not null default 'needs_review' check (
    verification_label in (
      'verified_accepting', 'verified_opening_soon', 'verified_next_cycle',
      'partially_verified_deadline_unclear', 'needs_review', 'closed', 'stale'
    )
  ),
  -- Section 9: a record with an unresolved material conflict (deadline,
  -- grade range, etc. disagreeing across sources) can never be labeled
  -- verified_*, regardless of how high its quality score is.
  add column if not exists has_unresolved_conflict boolean not null default false,

  -- Section 6 — application-status intelligence, independent of the plain
  -- deadline text deadline.ts already evaluates from application_deadline.
  add column if not exists application_opens_at timestamptz,
  add column if not exists application_closes_at timestamptz,
  add column if not exists status_evidence text,
  add column if not exists status_checked_at timestamptz,

  -- Section 3 — fields worth their own column because query.ts/ranking.ts
  -- or the detail page filter/sort/gate on them directly.
  add column if not exists age_min integer check (age_min is null or age_min >= 0),
  add column if not exists age_max integer check (age_max is null or age_max >= age_min),
  add column if not exists school_enrollment_required boolean,
  add column if not exists stipend_amount numeric check (stipend_amount is null or stipend_amount >= 0),
  add column if not exists hourly_pay numeric check (hourly_pay is null or hourly_pay >= 0),
  add column if not exists financial_aid_available boolean,
  add column if not exists transportation_support boolean,
  add column if not exists housing_support boolean,
  add column if not exists essay_required boolean,
  add column if not exists recommendation_required boolean,
  add column if not exists transcript_required boolean,
  add column if not exists interview_required boolean,
  add column if not exists parent_consent_required boolean,
  add column if not exists schedule_text text,
  add column if not exists attendance_requirements text,
  add column if not exists application_contact text,
  add column if not exists notification_date timestamptz,

  -- The long tail (demographic/membership restrictions, prerequisites,
  -- required experience, required documents, application steps, skills,
  -- expected outcomes, certificate/credit availability, program benefits)
  -- — never fabricated, only ever populated when extraction actually found
  -- evidence for that key. Each key present here also has a matching row in
  -- opportunity_field_evidence with the evidence/method/confidence that
  -- produced it.
  add column if not exists extended_details jsonb not null default '{}'::jsonb;

comment on column public.opportunities.verification_label is
  'Granular student-facing verification label (section 5): verified_accepting | verified_opening_soon | verified_next_cycle | partially_verified_deadline_unclear | needs_review | closed | stale. Computed by src/lib/opportunities/verification.ts. Distinct from verification_status, which existing query.ts/quality.ts logic already depends on.';
comment on column public.opportunities.has_unresolved_conflict is
  'True when two sources disagree on a material field (deadline, grade range) and neither has been resolved as newer/more-official — blocks any verified_* label until cleared. See src/lib/opportunities/conflicts.ts.';
comment on column public.opportunities.application_opens_at is
  'Application-opens timestamp derived from explicit status-phrase evidence (see src/lib/opportunities/application-status.ts) — independent of deadline.ts''s generic deadline-text parsing.';
comment on column public.opportunities.application_closes_at is
  'Application-closes timestamp derived from explicit status-phrase evidence — may match application_deadline when both extractors agree, but is evaluated independently so a stronger phrase signal is never silently discarded.';
comment on column public.opportunities.extended_details is
  'jsonb bag for deep-extraction fields with no dedicated column (demographic_restrictions, prerequisites, required_experience, required_documents, application_steps, skills, expected_outcomes, certificate_or_credit, program_benefits). Every key present has a matching opportunity_field_evidence row. Never fabricated — a missing key means "not found," not "no".';

create index if not exists opportunities_verification_label_idx on public.opportunities (verification_label);
create index if not exists opportunities_has_unresolved_conflict_idx on public.opportunities (has_unresolved_conflict);

-- ---------------------------------------------------------------------------
-- opportunity_field_evidence (section 4)
--
-- One row per extracted field per source observation — so "why is this
-- verified/unclear/stale" is a queryable fact trail, not just a log line.
-- Service-role only (same as every other ingestion-layer table since
-- Milestone 5) — students never query this table directly. A narrow,
-- sanitizing security-definer function below is the only student-reachable
-- path to any of this data, and it exposes a safe summary only.
-- ---------------------------------------------------------------------------

create table if not exists public.opportunity_field_evidence (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  field_name text not null,
  extracted_value jsonb,
  evidence_text text,
  source_url text,
  extraction_method text not null check (extraction_method in (
    'html_metadata', 'json_ld', 'open_graph', 'structured_api', 'llm_assisted', 'manual'
  )),
  confidence integer not null default 0 check (confidence between 0 and 100),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.opportunity_field_evidence is
  'Per-field extraction provenance: what value was read, from which source URL, by which method, at what confidence, and the evidence snippet it came from. Service-role only — see get_opportunity_evidence_summary() for the sanitized student-facing read path.';

create index if not exists opportunity_field_evidence_opportunity_id_idx
  on public.opportunity_field_evidence (opportunity_id);
create index if not exists opportunity_field_evidence_field_name_idx
  on public.opportunity_field_evidence (field_name);

alter table public.opportunity_field_evidence enable row level security;

-- ---------------------------------------------------------------------------
-- opportunity_review_queue — one additional reason value distinguishing "a
-- new annual cycle rolled over and needs confirming" from the existing
-- generic 'conflicting_sources' (a same-cycle factual disagreement) — see
-- src/lib/opportunities/conflicts.ts.
-- ---------------------------------------------------------------------------

alter table public.opportunity_review_queue drop constraint if exists opportunity_review_queue_reason_check;
alter table public.opportunity_review_queue add constraint opportunity_review_queue_reason_check check (
  reason in (
    'unknown_deadline', 'conflicting_sources', 'probable_duplicate',
    'low_confidence_grade', 'unclear_application_status', 'broken_application_url',
    'stale_source', 'residency_citizenship_ambiguity', 'new_cycle_unconfirmed'
  )
);

-- ---------------------------------------------------------------------------
-- get_opportunity_evidence_summary — the one safe student-facing read path
--
-- security definer, but deliberately narrow: takes only an opportunity id
-- (never a raw query), returns a fixed column set, and truncates/strips
-- evidence_text so a malformed extraction window can never leak a script
-- tag, token-shaped string, or an unbounded slice of page content to a
-- student's browser. set search_path = public defends against the classic
-- security-definer schema-resolution attack (same reasoning as
-- handle_new_user() in the Milestone 1 migration).
-- ---------------------------------------------------------------------------

create or replace function public.get_opportunity_evidence_summary(p_opportunity_id uuid)
returns table (
  field_name text,
  confidence integer,
  source_url text,
  evidence_text text,
  verified_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    e.field_name,
    e.confidence,
    e.source_url,
    -- Defensive truncation + tag stripping: evidence_text is already a short
    -- extracted window (see extraction.ts's relevantExcerpt), not raw HTML,
    -- but this function is the actual trust boundary, so it re-enforces the
    -- limit rather than assuming every caller upstream got it right.
    left(regexp_replace(coalesce(e.evidence_text, ''), '<[^>]*>', '', 'g'), 300) as evidence_text,
    e.verified_at
  from public.opportunity_field_evidence e
  where e.opportunity_id = p_opportunity_id
  order by e.field_name;
$$;

revoke all on function public.get_opportunity_evidence_summary(uuid) from public;
grant execute on function public.get_opportunity_evidence_summary(uuid) to authenticated;

comment on function public.get_opportunity_evidence_summary(uuid) is
  'Sanitized, read-only evidence summary for one opportunity — the only way an authenticated student session can see anything from opportunity_field_evidence. Strips tags and truncates evidence_text defensively.';

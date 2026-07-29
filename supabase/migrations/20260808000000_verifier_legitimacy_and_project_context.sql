-- Milestone 10.7 — Verifier Legitimacy, Field-Specific Confirmation, and
-- Personal-Project Context.
--
-- Three additive changes on top of the existing verification flow
-- (20260803000000_portfolio_verification.sql), none of which touch that
-- table's existing columns or behavior:
--
--   1. portfolio_items.project_context — lets an item skip the
--      organization-required path for personal/informal work (spec
--      section 5/6), nullable so every existing row is unaffected.
--   2. verification_field_confirmations — a verifier's response is now
--      per-field (participation/role/dates/hours/outcome), never one
--      "confirm everything" button.
--   3. verifier_domain_assessments — the domain-legitimacy context check
--      (MX/SPF/DMARC/free-email/role-mailbox/registration-age) run against
--      a verifier's email, recorded as supporting context only — never a
--      trust score by itself, per docs/security.md.

alter table public.portfolio_items
  add column if not exists project_context text check (
    project_context is null or project_context in ('org_linked', 'personal_project')
  );

comment on column public.portfolio_items.project_context is
  'org_linked requires organization/verifier-organization fields; personal_project explicitly waives them (spec section 5/6). Null = not yet classified — existing rows before Milestone 10.7 are unaffected.';

-- ---------------------------------------------------------------------------
-- verification_field_confirmations
-- ---------------------------------------------------------------------------

create table if not exists public.verification_field_confirmations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_item_id uuid not null references public.portfolio_items(id) on delete cascade,
  verification_id uuid not null references public.portfolio_verifications(id) on delete cascade,
  field text not null check (field in ('participation', 'role', 'dates', 'hours', 'outcome')),
  response text not null check (response in ('can_confirm', 'cannot_confirm', 'needs_correction')),
  note text check (note is null or length(note) <= 1000),
  created_at timestamptz not null default now(),
  constraint verification_field_confirmations_one_per_field unique (verification_id, field)
);

comment on table public.verification_field_confirmations is
  'A verifier''s response to one specific field of one specific claim — never a single "confirm everything." See docs/security.md (Milestone 10.7).';

create index if not exists verification_field_confirmations_user_idx
  on public.verification_field_confirmations (user_id);

create index if not exists verification_field_confirmations_verification_idx
  on public.verification_field_confirmations (verification_id);

alter table public.verification_field_confirmations enable row level security;

create policy "Users can view their own field confirmations"
  on public.verification_field_confirmations for select
  to authenticated
  using (auth.uid() = user_id);

-- No insert/update/delete policy for any client-facing role: the verifier
-- submitting these has no Avela session at all (they act through a one-time
-- link, same as the existing verifier-confirm flow), so every write here
-- goes through a service-role connection from src/lib/verification/actions.ts
-- after that action validates the token itself — the same split already
-- used for portfolio_verifications' verifier/reviewer paths.

-- ---------------------------------------------------------------------------
-- verifier_domain_assessments
-- ---------------------------------------------------------------------------
--
-- Append-only: one row per domain-check run against a verifier's email.
-- Supporting context only (spec section 5: "MX, SPF, DMARC, HTTPS, and
-- domain age do not prove employment") — never read as a trust score by
-- itself anywhere in this codebase.

create table if not exists public.verifier_domain_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_item_id uuid not null references public.portfolio_items(id) on delete cascade,
  verification_id uuid not null references public.portfolio_verifications(id) on delete cascade,
  verifier_email_domain text not null check (length(verifier_email_domain) <= 255),
  official_domain text check (official_domain is null or length(official_domain) <= 255),
  classification text not null check (
    classification in (
      'organization_domain_aligned', 'organization_domain_unconfirmed', 'personal_or_free_email',
      'role_mailbox', 'domain_mismatch', 'suspicious_or_disposable',
      'repeated_verifier_pattern', 'manual_review_required'
    )
  ),
  has_mx boolean not null default false,
  has_spf boolean not null default false,
  has_dmarc boolean not null default false,
  domain_registered_at timestamptz,
  is_free_email_provider boolean not null default false,
  is_role_mailbox boolean not null default false,
  notes text check (notes is null or length(notes) <= 1000),
  created_at timestamptz not null default now()
);

comment on table public.verifier_domain_assessments is
  'Domain-legitimacy context for one verifier-email check — supporting evidence only, never proof of employment or organizational authority. See docs/security.md (Milestone 10.7).';

create index if not exists verifier_domain_assessments_user_idx
  on public.verifier_domain_assessments (user_id);

create index if not exists verifier_domain_assessments_verification_idx
  on public.verifier_domain_assessments (verification_id, created_at);

-- Reviewer-only detection support (spec section 9: "one verifier confirming
-- many unrelated students") — never queried by, or exposed to, the student
-- whose claim it's attached to.
create index if not exists verifier_domain_assessments_email_domain_idx
  on public.verifier_domain_assessments (verifier_email_domain);

alter table public.verifier_domain_assessments enable row level security;

create policy "Users can view their own verifier domain assessments"
  on public.verifier_domain_assessments for select
  to authenticated
  using (auth.uid() = user_id);

-- No insert/update/delete policy for any client-facing role — this check
-- runs server-side (src/lib/verification/verifier-legitimacy.ts) whenever a
-- verification request is created or resent, always through a service-role
-- connection, never from a client-supplied write.

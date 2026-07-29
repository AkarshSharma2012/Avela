-- Milestone 10.7 — Reviewer/Admin Roles.
--
-- A proper server-side role table alongside (never replacing) the existing
-- REVIEWER_EMAILS env-var allowlist (src/lib/verification/reviewer-auth.ts)
-- — every currently-working reviewer keeps working with zero config
-- changes, since the new check is a plain OR: allowlisted-by-env OR
-- has-a-role-row. No auto-seeding happens here; granting a role is an
-- admin/service-role action (see src/lib/roles/repository.ts), same
-- "admin-safe, never client-reachable" shape as scripts/import-opportunities.ts.

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('student', 'reviewer', 'admin', 'owner')),
  -- Informational only (which admin/script granted this) — never used for
  -- access control itself.
  granted_by text check (granted_by is null or length(granted_by) <= 320),
  created_at timestamptz not null default now(),
  constraint user_roles_one_row_per_user_role unique (user_id, role)
);

comment on table public.user_roles is
  'Server-side role assignments (student/reviewer/admin/owner) — additive alongside REVIEWER_EMAILS, never client-writable. See docs/security.md (Milestone 10.7).';

create index if not exists user_roles_user_idx
  on public.user_roles (user_id);

create index if not exists user_roles_role_idx
  on public.user_roles (role);

alter table public.user_roles enable row level security;

-- No policies at all — not even a read-only one for the user themselves.
-- A student has no legitimate reason to read their own role row directly
-- (the app never needs to show "you are a reviewer" as a fact from this
-- table — reviewer-only pages are gated server-side by the check
-- functions in src/lib/roles/*, which use a service-role connection).
-- Every read and write goes through a service-role connection from
-- server-only code, matching opportunities/opportunity_sources'
-- "zero client-facing policies" pattern (Milestones 4/5).

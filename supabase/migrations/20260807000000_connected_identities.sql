-- Milestone 10.7 — Connected Identity (OAuth-based account ownership).
--
-- A manually typed GitHub username never proves account control (see
-- 20260805000000_portfolio_item_github_identity.sql's github_username
-- column, which stays exactly as-is — this migration does not touch it,
-- it only stops being the sole signal the OSINT connector treats as
-- ownership; see src/lib/osint/actions.ts). This migration adds the real
-- ownership signal: an OAuth-connected external account, tied to the
-- provider's own immutable subject id, never a typed string.
--
-- Three tables, all additive:
--   connected_identities        — current connection state, one row per
--                                  (student, provider) while active.
--   connected_identity_events   — append-only audit trail.
--   identity_possession_challenges — the fallback proof-of-control flow for
--                                  when OAuth isn't used (spec section 4's
--                                  "generate a short-lived random challenge").

-- ---------------------------------------------------------------------------
-- connected_identities
-- ---------------------------------------------------------------------------

create table if not exists public.connected_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('github')),
  -- The provider's own immutable numeric id (as text) — never the login,
  -- which can change. This is the column the uniqueness rule below actually
  -- protects; provider_username is display-only.
  provider_subject text not null check (length(provider_subject) between 1 and 100),
  provider_username text not null check (length(provider_username) between 1 and 100),
  provider_profile_url text check (
    provider_profile_url is null or (length(provider_profile_url) <= 500 and provider_profile_url like 'https://%')
  ),
  display_name text check (display_name is null or length(display_name) <= 200),
  avatar_url text check (avatar_url is null or (length(avatar_url) <= 500 and avatar_url like 'https://%')),
  -- AES-256-GCM ciphertext (iv || ciphertext || authTag, base64-encoded) —
  -- see src/lib/identity/token-crypto.ts. The decryption key
  -- (IDENTITY_TOKEN_ENCRYPTION_KEY) is read only in server-only modules,
  -- never sent to a client, never logged. Nullable because the
  -- possession-challenge fallback path (spec section 4) never has an OAuth
  -- token to store at all.
  access_token_ciphertext text,
  granted_scopes text[] not null default '{}'::text[],
  verified_at timestamptz not null default now(),
  last_checked_at timestamptz,
  -- null = active. Disconnection is a soft-delete via this column (never a
  -- row delete) so the audit trail and the global uniqueness index below
  -- both keep working correctly across a disconnect/reconnect cycle.
  disconnected_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.connected_identities is
  'OAuth-connected external accounts — the only source of identity-control credit; a typed username never earns this. See docs/security.md (Milestone 10.7).';

-- Anti-collusion: the same external account can never be *actively*
-- connected to two different students at once. This is a hard Postgres
-- unique-index constraint, not an RLS policy, so it is enforced regardless
-- of which student's session performs the insert — a client can only ever
-- see its own rows under RLS below, but the index still rejects a second
-- student's insert with a 23505 conflict (see
-- src/lib/identity/repository.ts's race-safe connect flow, cloned from
-- ensureVerificationRow's select-then-insert-with-unique-backstop pattern).
create unique index if not exists connected_identities_active_subject_idx
  on public.connected_identities (provider, provider_subject)
  where disconnected_at is null;

-- A student can have at most one *active* connection per provider —
-- reconnecting the same (or a different) GitHub account replaces the
-- existing row's disconnected_at/verified_at rather than creating a second
-- active row, so reconnecting never duplicates trust (spec section 4).
create unique index if not exists connected_identities_active_user_provider_idx
  on public.connected_identities (user_id, provider)
  where disconnected_at is null;

create index if not exists connected_identities_user_idx
  on public.connected_identities (user_id);

drop trigger if exists connected_identities_set_updated_at on public.connected_identities;

create trigger connected_identities_set_updated_at
before update on public.connected_identities
for each row
execute function public.set_updated_at();

alter table public.connected_identities enable row level security;

create policy "Users can view their own connected identities"
  on public.connected_identities for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create their own connected identities"
  on public.connected_identities for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Covers both a normal reconnect (clearing disconnected_at) and a
-- disconnect (setting it) — both are updates to the student's own row.
create policy "Users can update their own connected identities"
  on public.connected_identities for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No delete policy: disconnection is always disconnected_at, never a row
-- delete, so the audit trail and the one-active-per-provider index both
-- keep meaning something across the identity's full lifecycle.

-- ---------------------------------------------------------------------------
-- connected_identity_events
-- ---------------------------------------------------------------------------

create table if not exists public.connected_identity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connected_identity_id uuid not null references public.connected_identities(id) on delete cascade,
  event_type text not null check (
    event_type in ('connected', 'reconnected', 'disconnected', 'refresh_failed', 'repository_selected', 'role_confirmed')
  ),
  actor_type text not null check (actor_type in ('student', 'system')),
  reason text check (reason is null or length(reason) <= 2000),
  created_at timestamptz not null default now()
);

comment on table public.connected_identity_events is
  'Immutable audit trail for connected_identities — insert-only for every role. See docs/security.md (Milestone 10.7).';

create index if not exists connected_identity_events_user_idx
  on public.connected_identity_events (user_id);

create index if not exists connected_identity_events_identity_idx
  on public.connected_identity_events (connected_identity_id, created_at);

alter table public.connected_identity_events enable row level security;

create policy "Users can view their own connected identity events"
  on public.connected_identity_events for select
  to authenticated
  using (auth.uid() = user_id);

-- Students may only ever log events as themselves, for their own actions
-- (connected/reconnected/disconnected/repository_selected/role_confirmed);
-- 'system' actor_type events (refresh_failed, or any future automated
-- re-check) are only ever written by a service-role connection, the same
-- split as portfolio_verification_events and claim_dimension_events.
create policy "Users can log their own connected identity events"
  on public.connected_identity_events for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and actor_type = 'student'
    and exists (
      select 1 from public.connected_identities ci
      where ci.id = connected_identity_id and ci.user_id = auth.uid()
    )
  );

-- No update or delete policy on this table for any role.

-- ---------------------------------------------------------------------------
-- identity_possession_challenges
-- ---------------------------------------------------------------------------
--
-- The OAuth-unavailable fallback (spec section 4): a short-lived random
-- string the student places in a repo file/gist/issue/deployment endpoint,
-- verified server-side. Proves control of the target only — never
-- authorship, never impact. Only a hash of the challenge is stored, exactly
-- like portfolio_verifications.verification_code_hash.

create table if not exists public.identity_possession_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_item_id uuid references public.portfolio_items(id) on delete cascade,
  provider text not null check (provider in ('github')),
  -- The public https URL where the student placed the challenge string
  -- (a raw file URL, a gist URL, an issue URL, or a deployment endpoint) —
  -- validated as https-only and safe-fetched the same way any other
  -- OSINT-discovered URL is (see src/lib/osint/safe-fetch.ts), never
  -- treated as a shell command or path.
  target_identifier text not null check (length(target_identifier) between 1 and 500 and target_identifier like 'https://%'),
  challenge_type text not null check (challenge_type in ('repo_file', 'gist', 'issue', 'deployment_endpoint')),
  challenge_token_hash text not null check (length(challenge_token_hash) = 64),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'expired', 'revoked')),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.identity_possession_challenges is
  'OAuth-unavailable fallback control-proof challenges — hash-only, expiring, proves possession only. See docs/security.md (Milestone 10.7).';

create index if not exists identity_possession_challenges_user_idx
  on public.identity_possession_challenges (user_id);

create index if not exists identity_possession_challenges_hash_idx
  on public.identity_possession_challenges (challenge_token_hash);

create index if not exists identity_possession_challenges_expires_idx
  on public.identity_possession_challenges (expires_at)
  where status = 'pending';

drop trigger if exists identity_possession_challenges_set_updated_at on public.identity_possession_challenges;

create trigger identity_possession_challenges_set_updated_at
before update on public.identity_possession_challenges
for each row
execute function public.set_updated_at();

alter table public.identity_possession_challenges enable row level security;

create policy "Users can view their own possession challenges"
  on public.identity_possession_challenges for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create their own possession challenges"
  on public.identity_possession_challenges for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (
      portfolio_item_id is null
      or exists (select 1 from public.portfolio_items pi where pi.id = portfolio_item_id and pi.user_id = auth.uid())
    )
  );

create policy "Users can update their own possession challenges"
  on public.identity_possession_challenges for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No delete policy: an expired/revoked challenge stays as a row (status
-- flips), the same "state update, not a delete" convention as every other
-- table in this codebase.

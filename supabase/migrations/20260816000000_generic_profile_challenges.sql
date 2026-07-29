-- Milestone 10.8 — Generic Public-Profile Control Challenge (spec section 10).
--
-- The TIER-2 "place a short-lived code in an editable public page" flow,
-- generalized to any provider in src/lib/identity/provider-registry-data.ts
-- rather than GitHub alone. Deliberately a new, separate table rather than
-- widening identity_possession_challenges' `provider text check (provider
-- in ('github'))` constraint (20260807000000_connected_identities.sql) —
-- that table's GitHub-specific challenge_type values (repo_file/gist/
-- issue/deployment_endpoint) don't generalize cleanly to an arbitrary
-- platform's "put this code on a page you can edit" flow, and leaving it
-- untouched keeps the tested Milestone 10.7 GitHub fallback exactly as-is.
--
-- provider_key is a plain length-bounded text column, not a check-in-list
-- enum — same reasoning as portfolio_items.activity_category_key: the
-- provider registry is meant to grow without a migration per provider,
-- validated at the application layer
-- (provider-availability.ts/isProviderConnectable) instead.
--
-- Same shape and same RLS posture as identity_possession_challenges: the
-- student's own session may set status through to 'confirmed' directly,
-- because the real gate is the server-side safeFetch check in
-- generic-profile-challenge.ts (SSRF-protected, HTTPS-only, hash-only
-- token comparison), not RLS — same "server action logic is the actual
-- gate" reasoning documented on that table.

create table if not exists public.portfolio_generic_profile_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_item_id uuid references public.portfolio_items(id) on delete cascade,
  provider_key text not null check (length(provider_key) between 1 and 100),
  -- https-only per spec section 10 — stricter than safe-fetch.ts's general
  -- http-or-https allowance, enforced again at the application layer in
  -- generic-profile-challenge.ts before this row is ever written.
  target_url text not null check (length(target_url) between 1 and 500 and target_url like 'https://%'),
  challenge_token_hash text not null check (length(challenge_token_hash) = 64),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'expired', 'revoked')),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.portfolio_generic_profile_challenges is
  'Generic (any-provider) public-profile control-proof challenges — hash-only, expiring, HTTPS-only, proves control of the page only, never authorship. See docs/security.md (Milestone 10.8).';

create index if not exists portfolio_generic_profile_challenges_user_idx
  on public.portfolio_generic_profile_challenges (user_id);

create index if not exists portfolio_generic_profile_challenges_hash_idx
  on public.portfolio_generic_profile_challenges (challenge_token_hash);

create index if not exists portfolio_generic_profile_challenges_expires_idx
  on public.portfolio_generic_profile_challenges (expires_at)
  where status = 'pending';

drop trigger if exists portfolio_generic_profile_challenges_set_updated_at on public.portfolio_generic_profile_challenges;

create trigger portfolio_generic_profile_challenges_set_updated_at
before update on public.portfolio_generic_profile_challenges
for each row
execute function public.set_updated_at();

alter table public.portfolio_generic_profile_challenges enable row level security;

create policy "Users can view their own generic profile challenges"
  on public.portfolio_generic_profile_challenges for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create their own generic profile challenges"
  on public.portfolio_generic_profile_challenges for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (
      portfolio_item_id is null
      or exists (select 1 from public.portfolio_items pi where pi.id = portfolio_item_id and pi.user_id = auth.uid())
    )
  );

create policy "Users can update their own generic profile challenges"
  on public.portfolio_generic_profile_challenges for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No delete policy — same "state update, not a row delete" convention as
-- identity_possession_challenges and portfolio_possession_challenges.

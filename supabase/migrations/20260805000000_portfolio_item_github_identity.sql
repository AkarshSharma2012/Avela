-- GitHub identity for portfolio items (OSINT verification fix): lets a
-- student connect the GitHub account that actually owns/contributes to a
-- linked repository, so repository *ownership* can be checked by exact
-- account login rather than by guessing from the student's display name
-- (a display name and a GitHub login essentially never share tokens, e.g.
-- "Akarsh Sharma" vs. "AkarshSharma2012" — see src/lib/osint/matching.ts).
--
-- Stores one normalized username per item (src/lib/osint/github-identity.ts
-- accepts github.com/username, https://github.com/username, @username, or a
-- bare username and normalizes all of them down to this column) rather than
-- a separate profile_url column — the profile URL is always derivable from
-- the username.

alter table public.portfolio_items
  add column if not exists github_username text
    check (github_username is null or length(github_username) <= 39);

comment on column public.portfolio_items.github_username is
  'Student-supplied GitHub username connected to this item''s repository, normalized (no @, no URL) — see src/lib/osint/github-identity.ts. Used to check exact repository-owner/contributor/commit-author matches instead of relying on display-name similarity.';

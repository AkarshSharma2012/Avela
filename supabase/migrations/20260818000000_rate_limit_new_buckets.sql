-- Milestone 10.10A security audit — two confirmed-unbounded, client-reachable
-- write paths had no rate limit at all: creating a review link
-- (portfolio_review_links) and creating a confirmation request
-- (portfolio_confirmation_requests). Both reuse the exact same DB-backed,
-- atomic fixed-window counter (increment_rate_limit_counter, Milestone
-- 10.7) every other rate-limited action in this codebase already uses —
-- this migration only extends the bucket allowlist, no new function or
-- table.

alter table public.rate_limit_counters
  drop constraint if exists rate_limit_counters_bucket_check;

alter table public.rate_limit_counters
  add constraint rate_limit_counters_bucket_check check (
    bucket in (
      'verification_request', 'verification_resend', 'verifier_response', 'osint_check',
      'connect_attempt', 'possession_challenge', 'reviewer_decision',
      'review_link_create', 'confirmation_request_create', 'portfolio_file_upload'
    )
  );

# Milestone 10.10B1 — Data Retention Audit

Audit-only. No deletion jobs were added by this pass. Findings are based on
reading `src/`, `supabase/migrations/`, and `scripts/` — no `.github/`
workflows and no `vercel.json` exist in this repo, and `supabase/config.toml`
has no `[edge_runtime]`/scheduled-function or cron section, so **no
production scheduled job of any kind currently exists** in this codebase.

## Per-category findings

| Category | Retention status | Evidence |
|---|---|---|
| Active accounts (`profiles` + all owner-scoped tables) | **Indefinite / tied to account life** | No TTL column, no cron. Rows live until the `auth.users` row is deleted (cascades via `on delete cascade`, see `docs/database.md`). There is currently no account-deletion entry point in the app (see `docs/audit-10.10b1/user-rights-and-deletion.md` for the companion audit) — so in practice, retention today is "forever," not by policy but because no deletion path exists yet. |
| Deleted accounts | **Unknown / not applicable yet** | No deletion feature exists to observe. `profiles` has no delete RLS policy at all (`docs/security.md`: "No delete policy... Rows are only removed via the `on delete cascade` from `auth.users`"). Whatever eventually triggers that `auth.users` deletion (there is no code path today) is what would define this. |
| Uploaded files (`portfolio_files` / `student-portfolio` bucket) | **Tied to account life / item life** | Deleted only when a student deletes the item/file (`deletePortfolioItem`/`deletePortfolioFile` in `src/lib/portfolio/actions.ts`, storage object removed before the DB row). No independent TTL; no orphan sweep. |
| Review links (`portfolio_review_links`) | **Tied to token expiry (defined) + indefinite row retention** | `REVIEW_LINK_DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60` (30 days) in `src/lib/review-links/actions.ts` — the *token* becomes unusable at expiry, but the **row itself is never deleted**, expired or revoked. `viewed_count`, `title`, `expires_at`, `revoked_at` persist indefinitely. No sweep/cron removes old rows. |
| Confirmation requests (`portfolio_confirmation_requests`) | **Tied to token expiry (defined) + indefinite row retention** | `CONFIRMATION_LINK_TTL_SECONDS = 14 * 24 * 60 * 60` (14 days), `src/lib/confirmations/actions.ts`. Same pattern as review links: token expires, row (including the confirmer's free-text response, if any) stays forever. |
| Verification/claim links (`portfolio_verifications`) | **Tied to token expiry (defined) + indefinite row retention** | `VERIFICATION_LINK_EXPIRY_SECONDS = 60 * 60 * 24 * 14` (14 days), `src/lib/verification/constants.ts`. Row (verifier email, free-text notes/answers) persists indefinitely after expiry or use — no delete path found. |
| Expired tokens generally | **Fail-closed at use-time, not purged** | Every token type (`review-links`, `confirmations`, `verification`, `identity` possession/generic-profile challenges) is checked with `isTokenExpired()`/inline `expires_at` comparisons and correctly refuses to work once expired — but none are ever deleted from the database. Retention = indefinite by omission, security behavior (fail-closed) is correct. |
| Rate-limit counters (`rate_limit_counters`) | **Tied to security needs, but not purged** | `increment_rate_limit_counter()` keys on `(user_id, bucket, window_start)`; the window itself is short (1 hour–1 day per bucket, see `src/lib/integrity/rate-limit.ts`'s `RATE_LIMITS`), but old rows are never deleted once their window has passed — the table only grows. |
| OAuth state cookie (GitHub connect) | **Defined, short, self-expiring** | `OAUTH_STATE_TTL_SECONDS = 60 * 10` (10 min), `src/lib/identity/constants.ts`; it's a cookie (`avela_gh_oauth_state`), not a DB row, and the callback route explicitly deletes it (`cookieStore.delete(...)`) after use — the one retention story in this audit with actual cleanup. |
| Possession / generic-profile identity challenges (`identity_possession_challenges`, `portfolio_generic_profile_challenges`) | **Tied to token expiry (defined) + indefinite row retention** | `POSSESSION_CHALLENGE_TTL_SECONDS` / `GENERIC_PROFILE_CHALLENGE_TTL_SECONDS` = 24 hours each. Rows persist after expiry; no sweep found. |
| Integrity signals/reviews (`integrity_signals`, `integrity_reviews`) | **Indefinite / unknown** | No TTL column, no sweep. These are reviewer-only signals (`docs/security.md`: "Reviewer-only, never shown to the subject student") — indefinite retention here has a legitimate anti-abuse rationale, but there is no *stated* policy, just an absence of deletion code. |
| OSINT evidence/checks (`portfolio_osint_checks`, `portfolio_osint_evidence`) | **Defined retention window, but the sweep is unwired** | `OSINT_EVIDENCE_RETENTION_DAYS = 180` (`src/lib/osint/constants.ts`) computes an `expires_at` on every row. `deleteExpiredOsintChecks()` (`src/lib/osint/repository.ts:214-216`) implements the actual delete-where-expired sweep — **but it is never called from anywhere in `src/app` and there is no cron/scheduled invocation**. The code comment says so explicitly: "Not wired to a scheduler in this codebase... safe to run from a future cron job or admin script." This is the one place in the codebase where a retention *policy number* already exists but isn't enforced. |
| Email delivery logs | **N/A — no email provider is wired up** | Per `docs/security.md` (Milestone 10.10A): "No email provider is wired up in any environment... every 'sent' email is currently a masked server-console log line only." Whatever ends up in a real provider's own delivery logs (SendGrid/Postmark/etc.) once one is chosen is outside this app's control and outside this audit's visibility — must be documented when a provider is picked. |
| AI prompts/responses | **N/A — no AI provider integration found in the runtime app.** `src/lib/ai/` exists; see the data-inventory report for what's actually in it and whether it's wired to a real external call. If/when one is wired, its request/response retention (ours and the provider's) needs a stated policy before launch. |
| Generated exports | **N/A today** | No export feature is currently reachable by a user (see `user-rights-and-deletion.md`/`data-export.md` for what does exist — currently only internal library adapters, not a Server Action or route). Nothing is generated or stored to have a retention policy for yet. |
| Backups | **Unknown — outside this codebase** | Supabase-hosted-project backup schedule/retention is a project/plan setting in the Supabase dashboard, not something expressed in this repo. Not verifiable from code; must be confirmed against the actual Supabase project configuration by whoever administers it. |

## Cleanup jobs that DO exist (and their real scope)

- `scripts/e2e-cleanup.ts` / `src/lib/e2e/cleanup.ts` — **E2E-only**. Deletes only accounts where `user_metadata.e2e_test === true` AND email ends in `@e2e.avela.invalid` (`isGenuineE2eUser()`), and only ever runs against the isolated E2E Supabase project (`requireIsolatedE2eBackend()` refuses to run if `E2E_SUPABASE_URL` == the app's real `NEXT_PUBLIC_SUPABASE_URL`). Confirmed: **not a production retention mechanism**, purely a test-fixture sweep, manually invoked (`npm run e2e:cleanup`) or via the Playwright fixture teardown.
- No other cleanup/purge/cron code exists anywhere in `src/`, `scripts/`, or Supabase config.

## Recommendations (product-policy proposals only — not implemented)

1. Wire `deleteExpiredOsintChecks()` to a real scheduler (Supabase cron / pg_cron / external scheduled job) now that the 180-day policy already exists in code — lowest-risk retention gap to close since the number is already decided.
2. Decide and implement a row-purge policy for expired review links, confirmation requests, and verification requests (e.g. auto-delete N days after `expires_at` if never actioned) — currently these accumulate forever.
3. Decide a retention window for `rate_limit_counters` rows once their window has passed (e.g. delete rows older than 30 days) — currently unbounded growth, pure housekeeping, low legal sensitivity.
4. Decide whether `integrity_signals`/`integrity_reviews` need a retention cap, balanced against their anti-abuse purpose (may legitimately need to be long or indefinite — this is a product/trust-and-safety decision, not an engineering default).
5. Before choosing an email provider or AI provider, capture their own log-retention terms and add them to the subprocessor inventory (`data-inventory.md`).
6. Confirm actual Supabase-project backup retention against the dashboard/plan and document it — cannot be determined from this repo.

None of the above were implemented in this pass — they require a reviewed
retention policy, per the audit's own constraints.

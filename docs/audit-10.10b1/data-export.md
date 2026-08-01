# Data Export Audit — Milestone 10.10B1

Audit-only. No export feature is built in this pass.

## What exists today

`src/lib/export/` (`types.ts`, `text-summary-adapter.ts`, `evidence-index-adapter.ts`, `filename.ts`) plus one caller, `src/app/review/[token]/export/route.ts` (`GET /review/[token]/export` and `GET /review/[token]/export?type=evidence_index`).

This is **not** a general account-data export. Precisely, it is:

- **Reviewer-facing, not student-facing**: reached from a public, token-gated review link (`getReviewLinkForReviewer(token)`), not from an authenticated student session. A logged-in student has no equivalent "export my data" button anywhere in the product.
- **Scoped to exactly what the student already chose to put on that one review link** — the same title/organization/description/support-level/evidence-filename fields the `/review/[token]` page itself renders. Nothing beyond what's already visible on that public page is included.
- **Two output formats only**: a plain-text (`.txt`) activity summary (`textSummaryAdapter`) and a plain-text evidence index (`evidenceIndexAdapter`, not read in full this pass but same `ExportAdapter` interface). Both are `text/plain`, not JSON/CSV — not machine-readable in the structured sense the audit spec asks for.
- **`ExportBundle`'s own type** (`src/lib/export/types.ts`) only has room for `studentDisplayName`, `title`, and a flat list of `items` (title/organization/description/claimSupportHeadline/evidence) — structurally incapable of carrying profile fields, applications, reminders, connected identities, or raw files even if a caller wanted it to.
- Correctly excludes secrets: no token, id, or credential is ever included (`buildExportFilename` explicitly avoids the link's token or any internal id in the filename, per the route's own doc comment) — this part of the existing code already follows the right pattern for whatever a future real export builds.
- Headers are sound for what it is: `Cache-Control: private, no-store`, `Content-Disposition: attachment`, no caching of a token-derived page.

**No general "export my data" feature reachable by a logged-in student exists anywhere in the codebase.** Grepped for every plausible caller of the export lib (`@/lib/export` imports) — the review-link export route is the only one.

## Recommended full export package (proposal only — not implemented)

A real "export my data" feature, reachable from `/settings` (which already has a placeholder "more controls coming soon" section), should produce a single downloadable archive (e.g. a zip) containing:

| File | Source | Notes |
|---|---|---|
| `manifest.json` | Generated | Export timestamp, Avela app version/commit if available, list of included files, a one-line explanation of what's excluded and why. |
| `profile.json` | `profiles` | `display_name`, `grade_level`, `city`, `state`, `country`, `weekly_availability`, `experience_level`, `guided_mode`, `onboarding_completed(_at)`, `created_at`/`updated_at`. Never `id` needs hiding (it's the user's own id), but no other user's id should ever appear. |
| `interests.json` | `student_interests` | Selected interests + `other_text`. |
| `goals.json` | `student_goals` | Selected goals. |
| `preferences.json` | `student_opportunity_preferences` | Selected preference values. |
| `saved-opportunities.json` | `saved_opportunities` joined to `opportunities` (public fields only) | What was saved and when. |
| `applications.json` | `application_plans` + `application_tasks` | Plan status, target dates, task list — opportunity fields should be the same public snapshot as saved-opportunities, not internal ranking/quality-score fields. |
| `reminders.json` | `student_reminders` | All reminder rows for the user. |
| `portfolio.json` | `portfolio_items` + `portfolio_entry_narrative` + `portfolio_team_details`/`portfolio_team_collaborators` + `portfolio_personal_project_details` | The full evidence-entry content the student authored. |
| `evidence.json` | `portfolio_files` metadata (filename, mime type, size, upload date, which item) + `application_evidence_links` | Metadata only here — actual bytes go in `files/`. |
| `connected-identities.json` | `connected_identities` (public fields: provider, `provider_username`, `provider_profile_url`, `granted_scopes`, `verified_at`, `connected_at`) | **Never** the raw/encrypted OAuth token itself, and never `provider_subject` if that's treated as sensitive — see exclusions below. |
| `review-links.json` | `portfolio_review_links` + `portfolio_review_link_items` | Which links exist/existed, revoked status — **not** the raw token or token hash, so an exported file can never itself be used to reconstruct a working share link. |
| `confirmations.json` | `portfolio_confirmation_requests` + resulting `portfolio_verifications`/verifier-confirmed fields | What was asked, of whom (verifier email the student themselves supplied — their own data), and the outcome. |
| `files/` | Actual bytes for every `portfolio_files` row, fetched via the same signed-URL mechanism `getPortfolioFileDownloadUrl` already uses, one file per original filename (sanitized, de-duplicated) | Reuses proven, already-audited signed-URL/ownership-check code — no new access path needs to be invented. |

## Explicitly excluded from any export (per the audit's own instruction and confirmed necessary from this codebase's design)

- **Raw or encrypted OAuth tokens** (`connected_identities`' token column, protected by `IDENTITY_TOKEN_ENCRYPTION_KEY` per the env inventory) — exporting these would hand the student a live credential to their connected GitHub (or future provider) account in a downloadable file, a materially worse security posture than the signed-URL-per-click pattern the rest of the app already uses.
- **Service credentials** — never applicable here; `SUPABASE_SERVICE_ROLE_KEY` and friends are server-only and never touch any per-user data path in the first place.
- **Secret/token hashes** — review-link and confirmation-request tokens are stored hash-only (`docs/security.md`'s "tokens are single-purpose, hash-only stored" note); even the hash should not be exported, since it's meaningless to the student and only useful for token-matching internals.
- **Other users' private information** — verifier/confirmer emails the student themselves supplied are the student's own data (fine to include); but if a future feature ever lets one student see another's content (not true today per the live cross-user RLS test in `docs/security.md`), exports must stay strictly single-owner.
- **Internal abuse-detection logic/output** — `integrity_signals`, `integrity_reviews`, rate-limit counters, and the OSINT/verifier-legitimacy assessment tables are explicitly "reviewer-only, never shown to the subject student" by design (`docs/security.md` Milestone 10.7's own data-classification note). An export feature must not accidentally become a new disclosure path for those tables — this is as much a security requirement as a privacy one, since surfacing detection internals to the person being evaluated would defeat their purpose.

## Requirements for a real implementation (not built here, listed for the future work item)

Authentication/ownership: every query must scope to the exporting user's own `auth.uid()`, reusing the same server-client pattern (never service-role) every other Server Action in this codebase already uses — no new pattern needed.
Completeness: should cover every category above, not a subset.
Format: JSON (machine-readable) for structured data, actual files for `files/`, packaged together (zip) rather than one enormous JSON blob mixing binary and text.
CSV injection: not directly applicable if JSON is used instead of CSV as the primary format (recommended specifically to sidestep formula-injection risk in spreadsheet-opened CSVs); if any CSV output is added later, every user-supplied string field must be prefixed to neutralize leading `=`/`+`/`-`/`@` per standard CSV-injection mitigation.
Rate limiting: should reuse the existing DB-backed `increment_rate_limit_counter()` pattern (already used for review-link creation, confirmation-request creation, and file uploads per `docs/security.md` Milestone 10.10A) with a new bucket, since a full-account export is a heavier operation than any of those.
Audit logging: a lightweight "export requested at <time>" record is reasonable so a student can see their own export history, but should not become a new integrity-signal surface.
Safe filenames: reuse `buildExportFilename()`'s existing pattern (already proven not to leak tokens/ids into a filename).
Cross-user isolation: must be provably scoped to one user — the same live-tested RLS guarantee (`docs/security.md`'s 12-attack cross-user test) is the right bar, and every new query this feature adds should be covered by an equivalent test before shipping.

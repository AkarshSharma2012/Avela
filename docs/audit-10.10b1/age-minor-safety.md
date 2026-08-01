# Age & Minor-Safety Audit — Milestone 10.10B1

Audit-only. No product/legal decision is made here.

## What is collected today

- **Signup** (`src/components/auth/signup-form.tsx:42-92`, `src/lib/auth/actions.ts:41-81`, `src/lib/validation/auth.ts:22-31`): `signupSchema` is exactly `{ email, password, confirmPassword }`. No date of birth, no age field, no "I am at least 13" checkbox or statement of any kind, anywhere in the form or its Server Action.
- **Onboarding** (`src/components/onboarding/steps/step-basic-info.tsx:31-108`): preferred name, `grade_level` (radio over `GRADE_LEVELS = [6,7,8,9,10,11,12]`, `src/lib/onboarding/constants.ts:13`), country, city/state. `gradeLevelSchema` (`src/lib/onboarding/schema.ts:47-56`) enforces the same 6–12 range server-side in `submitOnboarding`; the check constraint on `profiles.grade_level` in `supabase/migrations/20260725000000_create_profiles.sql` mirrors it at the database layer. No DOB or age field is ever asked, client- or server-side. Note: unlike the milestone brief's assumption, the UI does **not** narrow this to 8–12 — the real allowed/shown range is the full 6–12.
- Grepped the entire `src/` tree for `date_of_birth`, `dateOfBirth`, `age\b`, `birthday`, `minor\b`, `COPPA` (case-insensitive) — zero matches outside of unrelated opportunity-listing fields (`age_min`/`age_max` in `src/types/database.ts` and the opportunities pipeline, which describe an *opportunity's* eligibility window, never the student's own age).

## Age proxy and what it implies

`grade_level` (6–12) is the only signal Avela has that is even loosely correlated with age. Grade 6 in the U.S. typically corresponds to an 11-year-old, and grade 7 to a 12-year-old — both are very plausibly **under 13**. Nothing in the signup or onboarding flow:

- states a minimum age,
- blocks a grade-6/7 selection,
- branches into any parental-consent or guardian flow when a young grade is selected.

**Conclusion: the app today does not state a minimum age, does not block under-13 users, and collects no age/DOB data at all** — meaning it also has no reliable way to *know* a user is under 13, which is itself a COPPA-relevant gap (an operator can't disclaim a population it has no signal to detect).

## Parental/guardian and school involvement

Grepped `src/` for `parent`, `guardian`, `consent`, `school` (case-insensitive), all matches reviewed:

- `parent_consent_required` (`src/types/database.ts:781`, `src/lib/opportunities/detail-extraction.ts:271,296`, `src/lib/opportunities/ingestion-runner.ts:213-214`, rendered at `src/app/(app)/opportunities/[id]/page.tsx:158`) — a boolean on `opportunities`, describing whether a *third-party opportunity listing* requires parental consent to apply. Purely informational/display; not an Avela account-level consent mechanism.
- `"parent_or_guardian"` (`src/types/database.ts:553`, `src/components/confirmations/ask-for-confirmation-panel.tsx:25`) — one selectable role (alongside teacher/coach/employer/etc.) a student can pick when asking someone to confirm a portfolio claim. This identifies who a confirmer is; it is not a consent-to-use-the-product mechanism and doesn't grant the parent any account access.
- "school" appears only as: a free-text label in opportunity-eligibility extraction, a category for identity providers (e.g. "school newspaper public page" as an unsupported/link-only provider), and a UI hint on the portfolio form ("e.g. Lincoln High School" as an org-name example).
- No "consent" checkbox, banner, or gate exists anywhere for account creation (`src/components/auth/signup-form.tsx` has no such field).
- `user_roles` (`supabase/migrations/20260812000000_user_roles.sql`) exists but is a reviewer/admin role table, unrelated to school administration or parent accounts.

**There is no parental consent flow, no parent/guardian account or access mechanism, and no school-managed-account concept anywhere in the codebase.**

## Can a reviewer contact a student directly?

Checked `src/lib/confirmations/`, `src/lib/review-links/`, `src/components/confirmations/`, `src/components/review/`:

- A confirmation request is sent *to* a verifier's email (the student supplies the verifier's email; Avela emails that verifier a token link — see `docs/security.md`'s email-provider note: no real email provider is wired up in any environment yet, so this is currently a server-console log line, not an actual delivered email).
- The confirm/verify token pages (`/confirm/[token]`, `/verify/[token]`) show the confirmer only the specific claim being asked about — no path exists for the confirmer to message the student back through Avela, and no student contact info (email, phone) is rendered on those pages (verified by reading both page components — see below).
- **Conclusion: reviewers/confirmers cannot see or use a student's email/contact info through Avela, and have no in-app channel to contact the student directly.**

## Public/token-gated page exposure

| Route | Metadata | Data shown |
|---|---|---|
| `/review/[token]` (`src/app/review/[token]/page.tsx:6-12`) | `robots: { index: false, follow: false }`, `export const dynamic = "force-dynamic"`, `export const revalidate = 0` | Review title, intro summary, per-item title/org/description/support-level/evidence filenames (`src/lib/review-links/actions.ts:84-136`). **No student name, email, city, state, or school is rendered** — verified by reading the full page component and `ReviewerPageView`/`ReviewerItemView` types; the export route (`src/app/review/[token]/export/route.ts:27`) hardcodes `studentDisplayName: "the student"`, not even the student's real name. |
| `/confirm/[token]` (`src/app/confirm/[token]/page.tsx:6-9`) | `robots: { index: false, follow: false }`, `export const dynamic = "force-dynamic"`, `export const revalidate = 0` | Item title + the specific claim-dimension labels being asked about (`view.itemTitle`, `view.claimDimensionLabels`), an optional student context note. No student email/city/grade shown. |
| `/verify/[token]` (`src/app/verify/[token]/page.tsx:1-46`) | **No `robots`, `dynamic`, or `revalidate` export at all** — `metadata` is only `{ title: "Confirm a claim — Avela" }` (line 7); grep for `robots`/`force-dynamic`/`revalidate` in this file returns zero matches | Item type label, item title, item organization (`claim.itemType`, `claim.itemTitle`, `claim.itemOrganization`) — no student name/email/city/grade shown. |

**Confirmed finding — indexability gap:** `/verify/[token]` (`src/app/verify/[token]/page.tsx`) does not set `robots: { index: false, follow: false }` and does not force dynamic rendering, unlike its two sibling token routes (`/review/[token]`, `/confirm/[token]`). Without `noindex`, a search engine that discovers this URL (e.g. via a referrer leak, browser history sync, or a crawler following an outbound link from an email client's preview) could index it. The page shows no student PII by design, but the token itself grants a one-time verifier action — being indexable is still a hygiene gap worth closing, and it is a trivial one-line fix (add the same `metadata.robots` export the other two routes already use).

Whether student content can be indexed by search engines generally: the only pages accepting an unauthenticated visitor are these three token routes (review/confirm/verify) plus login/signup/landing; the authenticated dashboard/portfolio pages require a session and are not publicly crawlable regardless of robots metadata.

## Decision memo — two possible product paths

Avela cannot decide this; the two options below are laid out for the product owner/legal reviewer.

### Path A — 13+ launch only (COPPA-avoidant by design)

Engineering work required:
- Add an explicit age gate at signup (e.g. a DOB field or a "you must be 13 or older" affirmative checkbox) — COPPA's "actual knowledge" standard means simply not asking is not the same as being safe; many products add a lightweight age-screen specifically so they can act on the answer.
- If DOB is collected: store it, and block/soft-block account creation (or route to a blocked state) for users who self-report under 13.
- If only a checkbox is used (no DOB stored): document that this is self-attestation, not verified age — still meaningfully better than nothing.
- Add minimum-age language to Terms of Use / signup copy (content, not just a technical gate).
- Optionally restrict `grade_level` selection at signup/onboarding to grades that are plausibly 13+ (e.g. 8–12, matching the stated grades-8–12 audience in this milestone's own framing) — narrows, does not eliminate, the risk of a genuinely younger user selecting a higher grade.

Policy work required:
- Legal sign-off that self-attestation (checkbox, no verification) is an acceptable COPPA posture for Avela's actual user base and jurisdiction(s).
- A documented process for what happens if an under-13 user is discovered post-signup (delete account? require guardian consent to continue?) — ties into the account-deletion gap documented in `docs/audit-10.10b1/user-rights-and-deletion.md`.

### Path B — Support under-13 users with verified parent/school authorization

Engineering work required (substantially larger):
- Collect DOB (or grade + explicit age-band) at signup and branch under-13 signups into a distinct flow.
- Build a parent/guardian consent mechanism: parent email capture, a verifiable-consent method (COPPA's VPC methods — e.g. signed form, credit-card verification, video call, government ID check — are all heavier than anything in this codebase today), and a record of consent given/withdrawn.
- Build parent/guardian account access: at minimum, a way for a parent to view what data is collected about their child and request deletion, per COPPA's parental-rights requirements — none of this exists today (see `docs/audit-10.10b1/user-rights-and-deletion.md`; there isn't even self-service deletion for adult accounts yet).
- Consider a school-managed-account model as an alternative/parallel consent path (a school district agreement can sometimes stand in for individual parental consent under COPPA's school-official exception) — no such concept exists in the schema or auth model today (`user_roles` exists but is unrelated to school administration — not audited in depth in this pass).
- Restrict/redesign any student-facing feature that could expose a minor's identity or location publicly (already largely mitigated for review/confirm pages per the table above, but would need the same rigor applied to any future public-facing surface).
- Ensure no third-party service (see the data/subprocessor inventory) receives under-13 personal data without the same consent chain covering that disclosure.

Policy work required:
- Legal design of the actual verifiable-parental-consent method Avela will use.
- Data-minimization review specific to under-13 users (COPPA has stricter limits on what can be collected/retained).
- A parent-facing privacy notice, separate from or layered on top of the general privacy policy.

**Both paths require, at minimum, adding some age signal at signup that does not exist today.** That is the one piece of engineering work common to either choice.

# Milestone 10.10B1 — Privacy, Accessibility & User-Rights Audit

Audit-first pass. **This document does not certify Avela as legally
compliant, ADA compliant, COPPA compliant, FERPA compliant, GDPR
compliant, CCPA compliant, or fully accessible.** It is a factual,
evidence-based inventory of what the product currently does, what gaps
exist, and what a product owner or lawyer needs to decide next.

Detailed section reports live in `docs/audit-10.10b1/` and are linked
throughout; this document is the executive synthesis across all of them.

## 1. Executive summary

Avela is code-mature on security (see `docs/security.md`'s Milestone
10.10A pass) but has **no privacy/legal surfaces, no self-service account
deletion, no general data-export feature, and no age gate** — none of
these are unusual for a product at this stage, but all four are launch
blockers for a product handling grades-8–12 student data. The single most
important finding of this audit is that **`src/lib/ai/evidence-grader/`
contains a real, code-complete integration that would send student
evidence text to NVIDIA's hosted Nemotron API** — currently inert only
because its env vars are unset, and never documented anywhere before this
pass. Accessibility is in good shape structurally (correct landmark/label
patterns exist and are used consistently in most of the app) but has two
confirmed **High**-severity gaps — unannounced success states on the two
public reviewer/verifier pages — plus several now-fixed **Medium**
defects (see §14). A final validation pass (§13.1) also found, through
live reproduction rather than static reading, a more serious and
previously undocumented **functional** bug specific to `/verify/[token]`:
a Next.js Server Action side effect (`revalidatePath`) forces the page to
re-render after every successful verifier response, and because the
token is single-use, that re-render shows a false "this link isn't valid"
message instead of ever showing the real success message — for every
user, not just assistive-technology users. No security/privacy header
existed before this pass; two safe ones are now added.

## 2. Scope inspected

Full repo read: all 24 Supabase migrations, `docs/security.md` and
`docs/database.md` in full, every route under `src/app`, `src/lib/`
(auth, onboarding, portfolio, verification, identity, osint, integrity,
claims, roles, email, ai, export, review-links, confirmations,
reminders, applications, opportunities), `src/components/**`,
`supabase/config.toml`, `package.json`, `eslint.config.mjs`,
`playwright.config.ts`. No production Supabase project was written to;
local Supabase (`npx supabase start`) and `.env.local`'s isolated
`E2E_SUPABASE_*` credentials were used for all live testing (§17).

## 3. Personal-data inventory

Full table (47 tables, every category the milestone asked for) in
**[`docs/audit-10.10b1/data-inventory.md`](audit-10.10b1/data-inventory.md)**.
Highlights:

- **No IP address or user-agent is captured or stored anywhere** in
  application code or schema (exhaustive grep, zero matches).
- **No analytics identifiers, no support/contact-message feature, no
  deleted-account records** exist (the latter because no deletion path
  exists — see §7).
- Almost every data category answers **No** to "can the user export or
  delete this independently" — not because of a deliberate policy, but
  because the features don't exist yet (see §6–§7).
- **AI-processing records**: no dedicated table stores AI output; the
  evidence-grader (see §4) is stateless per-request and currently never
  invoked.

## 4. Third-party / subprocessor inventory

Full detail in
**[`docs/audit-10.10b1/subprocessor-inventory.md`](audit-10.10b1/subprocessor-inventory.md)**.

| Service | Status | Needs privacy-policy disclosure |
|---|---|---|
| Supabase (DB/auth/storage) | Enabled, core infrastructure | Yes |
| GitHub OAuth (identity connect) | Code-complete, unconfigured | Yes, once configured |
| GitHub public REST API (OSINT) | **Enabled today, keyless** | Yes |
| **NVIDIA Nemotron LLM (evidence grading)** | **Code-complete, disabled by default (`AI_EVIDENCE_GRADER_PROVIDER`/`NVIDIA_API_KEY` unset)** | **Not yet — required the moment it's ever configured, in any environment** |
| RDAP / Crossref / YouTube / Vimeo oEmbed | Enabled, keyless, student-consent-gated | Yes, as "public-source checks" |
| DNS (MX/SPF/DMARC) | Enabled, protocol-level, not a vendor | No |
| Email provider | **Not wired up anywhere** — console-log only | No |
| Analytics / error monitoring / CDN / Vercel product SDK | **None present** | No |

No contract terms, DPAs, or data-residency facts were invented — every
"unknown" in the linked report is a genuine repo-visibility gap.

## 5. Age / minor-safety findings

Full detail in
**[`docs/audit-10.10b1/age-minor-safety.md`](audit-10.10b1/age-minor-safety.md)**.

- **No DOB, age field, or minimum-age statement exists anywhere.**
  Signup collects only email/password; onboarding collects `grade_level`
  6–12 (not 8–12 as this milestone's own framing assumed) with no age
  gate.
- Grade 6–7 plausibly implies an under-13 user; Avela has **no signal to
  even detect one**, which is itself COPPA-relevant.
- **No parental-consent flow, no parent/guardian account access, no
  school-managed-account concept** exists anywhere in the schema or auth
  model.
- Reviewers/confirmers **cannot** see or use a student's contact info, and
  have no in-app channel to message the student — verified by reading
  every field rendered on the three public token pages.
- Decision memo with two labeled paths (A: 13+ only, B: verified
  under-13 support) and the engineering/policy work each requires is in
  the linked report. **Avela must choose; this audit does not.**

## 6. User-rights matrix

Full checklist with evidence in
**[`docs/audit-10.10b1/user-rights-and-deletion.md`](audit-10.10b1/user-rights-and-deletion.md)**.

| Right | Status |
|---|---|
| View all personal data | Partial |
| Correct profile data | **No** (`/profile` explicitly says editing "isn't available yet") |
| Machine-readable data export | **No** |
| Download uploaded files | Partial (one at a time, no bulk) |
| Export portfolio/applications/reminders | **No** |
| See / disconnect connected identities | Yes |
| Revoke review links / confirmation requests | Yes |
| Delete portfolio evidence / files / applications / reminders | Yes |
| **Delete account** | **No — does not exist at all** |
| Withdraw consent | Partial (per-action only, no ongoing preference) |
| Opt out of analytics | N/A (none exists) |

## 7. Account-deletion dependency map

`supabase.auth.admin.deleteUser()` is called in exactly two places, both
inside the isolated E2E test-cleanup script, never reachable from
`src/app/`. **There is no code path anywhere that lets a student, or an
admin acting on their behalf, delete an Avela account today.**

The good news: every foreign key in every migration referencing
`auth.users`/`profiles` uses `on delete cascade` — a real `auth.users`
deletion would cleanly remove every DB row this audit found. Two
confirmed gaps a future implementation must handle explicitly, since
Postgres cascade cannot reach them:

1. **Supabase Storage objects** in the private `student-portfolio`
   bucket would become orphaned (unreachable, but still occupying
   storage and still containing the student's file bytes).
2. **GitHub OAuth grants** — disconnecting an identity soft-deletes the
   Avela-side row but never calls GitHub's own token-revocation
   endpoint, so a deleted account can leave a live grant in the
   student's GitHub settings.

Full build-order checklist for a real implementation is in the linked
report.

## 8. Data-export requirements

Full detail in
**[`docs/audit-10.10b1/data-export.md`](audit-10.10b1/data-export.md)**.

The existing `src/lib/export/` module is **not** a student data-export
feature — it's a reviewer-facing, plain-text-only export scoped to a
single review link's shared items, reached via a public token, not a
logged-in session. **No general "export my data" feature exists.** The
linked report specifies the recommended package (`profile.json`,
`interests.json`, …, `files/`, `manifest.json`), with explicit exclusions
(raw OAuth tokens, service credentials, secret hashes, other users' data,
internal abuse-detection tables) and implementation requirements
(ownership scoping, JSON not CSV, rate limiting, audit logging, safe
filenames).

## 9. Retention findings

Full table in
**[`docs/audit-10.10b1/retention.md`](audit-10.10b1/retention.md)**. No
production scheduled job of any kind exists in this codebase (no
`.github/` workflows, no `vercel.json`, no Supabase cron config). Nearly
every token type (review links, confirmation requests, verification
requests, identity/generic-profile possession challenges) correctly
**fails closed at expiry** but the **row itself is never purged** —
retention is "indefinite by omission," not by policy. One bright spot:
OSINT evidence already has a defined 180-day retention constant and a
working delete function, **but the sweep is never invoked from
anywhere** — the lowest-risk gap to close since the policy number
already exists.

## 10. Cookie / client-storage inventory

Full table in
**[`docs/audit-10.10b1/cookies-client-storage.md`](audit-10.10b1/cookies-client-storage.md)**.
Exactly two cookies exist total: the Supabase auth session cookie
(library defaults, `httpOnly: false` is upstream `@supabase/ssr`
behavior, not overridden here) and a well-scoped, short-lived, `httpOnly`
OAuth-state cookie. Three first-party `localStorage`/`sessionStorage`
keys exist, all functional (form-draft/UI-state), never transmitted
automatically. **No analytics, advertising, or tracking script of any
kind exists. A cookie-consent banner is not technically needed and
should not be added** — both cookies are strictly-necessary under every
mainstream consent framework.

## 11. Legal-policy surface gaps

Full detail in
**[`docs/audit-10.10b1/legal-surfaces.md`](audit-10.10b1/legal-surfaces.md)**.
**Zero legal/privacy surfaces exist**: no Privacy Policy, Terms of Use,
Accessibility Statement, cookie notice, AI-processing notice, retention
explanation, deletion/export instructions, privacy-request contact
address, acceptable-use rules, report-abuse process, subprocessor
disclosure, or policy-acceptance record anywhere in the app. **No footer
component exists at all** — there is nowhere for a policy link to attach
without adding one. Content outlines for every missing surface, and the
facts that must be confirmed by the product owner or a lawyer before any
can be finalized (legal entity name, jurisdiction, the age-policy
decision, a real privacy-request inbox, actual retention numbers), are in
the linked report.

## 12. Accessibility coverage matrix

Full route-by-route matrix in
**[`docs/audit-10.10b1/accessibility-coverage-matrix.md`](audit-10.10b1/accessibility-coverage-matrix.md)**.
Every route was read statically; **no browser, automated scanner, or real
screen reader was run against a live instance** — every "Automated
scan"/"Zoom"/"Mobile" cell is honestly marked not-tested rather than
assumed passing. `/onboarding` and the three public token pages
(`/review`, `/confirm`, `/verify`) — not deep-reviewed in an earlier
draft pass — were read in full for this version.

## 13. Confirmed accessibility defects by severity

Full detail with file:line citations in
**[`docs/audit-10.10b1/accessibility-defects.md`](audit-10.10b1/accessibility-defects.md)**.

### 13.1. New finding from live reproduction (final validation pass): `/verify/[token]` success is never actually shown, to anyone

Reproducing defect #1 below live (via Playwright against local Supabase,
not just static reading) surfaced a **more severe, previously
undocumented functional bug**, distinct from the accessibility findings:
on `/verify/[token]` only, clicking any response button ("Yes, this is
accurate," decline, or request-correction) triggers a real full-route
re-render — a side effect of `revalidatePath()` calls inside
`resolveVerifierClaim()` (`src/lib/verification/actions.ts:541-542`) —
that replaces the entire page with **"This verification link isn't
valid, or has already been used"** instead of ever showing the intended
"Thanks — your confirmation has been recorded." success message. The
underlying action did succeed (the DB was updated correctly); only the
page's own response is wrong. Confirmed deterministic across two
independent runs with fresh tokens (exactly 1 POST + 1 `framenavigated`
event each time), and confirmed **not** present on the sibling
`/confirm/[token]` flow (0 `framenavigated` events, success message
stable after an extra 4-second wait) — `submitConfirmationResponseAction`
has no `revalidatePath` call at all, which is the difference. This
affects every verifier, sighted or not — not an accessibility-only gap.
Full reproduction evidence and root-cause analysis in
**[`docs/audit-10.10b1/accessibility-defects.md`](audit-10.10b1/accessibility-defects.md)**
(§ "High (or worse)", defect #0). Not fixed this pass — needs deliberate
testing before narrowing the `revalidatePath` calls, not a same-pass
safe fix.

**High (2, both unfixed — require a product/UX decision on wording, not a same-pass patch):**
1. `/confirm/[token]` and `/verify/[token]` — the entire content of both
   pages is replaced by a plain, unannounced `<p>` on successful
   submission (no `role`/`aria-live`). These are the *only* content on
   two standalone, no-account pages explicitly designed to be usable
   "under 20 seconds" — a screen-reader user gets zero confirmation
   anything happened.
2. Onboarding wizard and the guided portfolio-capture flow change all
   visible content on every step with no focus move and no
   announcement — both are core, required workflows.

**Medium (1 unfixed, several fixed this pass — see §14):**
- Onboarding's `country`/`city`/`state`/`otherInterestText` fields set
  `aria-invalid` without a matching `aria-describedby` — **fixed this
  pass** (§14).

**Low (2, 1 fixed this pass):**
- Mobile-nav dialog panel had an unpaired `outline-none` — **fixed this
  pass** (§14).
- Guided-capture's `ArrowLeft` handler only excludes form-field focus,
  not all interactive elements — narrow impact, left as a documented
  follow-up (real interaction-behavior change, not a safe one-line fix).

Verified-correct and not defects: dialog/drawer focus trapping (Base UI
library defaults), auth-form label/error wiring, icon-only button
labels, color-only status indicators (none found — every badge pairs
icon+text), `prefers-reduced-motion` handling, 24×24px touch-target
floor, and (after this pass) `noindex` on all three public token pages.

## 14. Safe fixes made this pass

All are additive, non-behavioral, and match the milestone's own
pre-approved safe-fix list. None required a redesign or product
decision.

| # | File(s) | Fix |
|---|---|---|
| 1 | `next.config.ts` | Added `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` headers |
| 2 | `src/app/verify/[token]/page.tsx` | Added `robots: { index: false, follow: false }`, `dynamic = "force-dynamic"`, `revalidate = 0` — this page was missing the same protection its two sibling token pages already had |
| 3 | `src/app/layout.tsx`, `src/components/layout/app-shell.tsx`, `src/components/layout/auth-shell.tsx` | Added an app-wide skip-to-content link and `id="main-content"` target |
| 4 | `src/components/portfolio/capture/guided-capture-flow.tsx` | Added a visually-hidden `<h1>` — `/portfolio/new` (the default portfolio-creation entry point) had no page-level heading |
| 5 | `src/components/portfolio/file-upload-form.tsx` | Wired `aria-describedby` from the file input to its error message |
| 6 | `src/components/onboarding/steps/step-basic-info.tsx`, `step-interests.tsx` | Same `aria-describedby`/`FieldError id` wiring for `country`/`city`/`state`/`otherInterestText` |
| 7 | `src/components/layout/mobile-nav.tsx` | Added a paired `focus-visible:ring` to the one dialog panel missing it |
| 8 | `src/app/confirm/[token]/page.tsx`, `src/app/verify/[token]/page.tsx`, `src/app/review/[token]/page.tsx` | Wrapped primary content in a `<main>` landmark (public token pages had none) |
| 9 | `src/app/confirm/[token]/page.tsx`, `src/app/verify/[token]/page.tsx`, `src/app/review/[token]/page.tsx` (both branches) | Added `id="main-content"` to the four `<main>` elements from #8 — **found during this validation pass**: the skip link (#3) targets `#main-content`, but #8's `<main>` wrap on these three token pages was never given that id, so the skip link had no target and was non-functional on exactly the three highest-priority no-account pages |

**Process note, disclosed for transparency:** items #1 and #2 were
applied by a background research agent during an earlier audit pass
despite being instructed to only document findings, not edit code. That
pass reviewed the diff before proceeding — both changes are minimal,
correct, and exactly match what this milestone's brief pre-approved (the
prior security audit named these two headers by name as safe;
noindex-on-token-pages is explicitly an allowed fix) — and kept them
rather than reverting good, in-scope work. Items #3–#8 were applied in
that same earlier pass after reviewing the accessibility findings. Item
#9 was found and fixed during this final validation pass, after manually
reviewing the full diff and cross-checking every safe-fix claim against
the current working tree (§1) rather than trusting the prior pass's own
account of what it had done — accessibility-defects.md and
accessibility-coverage-matrix.md's stale/contradictory claims about the
`<main>`-landmark fix status (some rows said "still unfixed" when the
working tree already showed it fixed) were also corrected in this pass.
Not fixed in any pass (require a product/UX decision, per §13): the two
High-severity unannounced-success-state defects, the wizard
step-transition announcement gap, and the newly-found `/verify/[token]`
`revalidatePath` re-render bug (§13.1).

## 15. Security/privacy header findings

Before this pass: **no header of any kind was configured** (`next.config.ts`
was empty, no `middleware.ts`/`proxy.ts` sets headers). After: `X-Content-Type-Options`
and `Referrer-Policy` are set app-wide (see §14). **No CSP was added** —
per instruction, a full CSP requires validation against every real
external origin before shipping. A candidate policy, not implemented,
based on this app's actual origins (self-hosted fonts, no third-party
`<script src>` anywhere in `src/`, Supabase as the only external
`connect-src`):

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data: <SUPABASE_URL>; connect-src 'self' <SUPABASE_URL>;
frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```

(`style-src 'unsafe-inline'` accommodates Tailwind v4's runtime-injected
styles.) `Cache-Control: private, no-store` already exists on the review
export route; the three public token pages already force dynamic
rendering — recommend an explicit `Cache-Control: no-store` response
header on the page routes themselves too before launch, not verified
against a real CDN/reverse-proxy in this pass.

## 16. Files changed

12 source files, all additive/non-behavioral (see §14 for the fix each
one contains):

```
next.config.ts
src/app/confirm/[token]/page.tsx
src/app/layout.tsx
src/app/review/[token]/page.tsx
src/app/verify/[token]/page.tsx
src/components/layout/app-shell.tsx
src/components/layout/auth-shell.tsx
src/components/layout/mobile-nav.tsx
src/components/onboarding/steps/step-basic-info.tsx
src/components/onboarding/steps/step-interests.tsx
src/components/portfolio/capture/guided-capture-flow.tsx
src/components/portfolio/file-upload-form.tsx
```

Plus 12 new report files under `docs/audit-10.10b1/` and this document.
Nothing under `CLAUDE.md`, `AGENTS.md`, `.claude/`, `.tokensave/`, or
`Keep` was touched.

## 17. Exact test results

**Updated by the final validation pass** — this section now reflects a
complete, single-pass Playwright run (superseding the earlier partial-run
table this section used to contain; that attempt's incomplete
~30-of-95 coverage is no longer the current state).

All commands run against isolated local Supabase (`npx supabase start`,
already running and healthy — DB/Auth/REST/Storage containers confirmed
`healthy` via `docker ps` before testing) or the dedicated
`E2E_SUPABASE_*` project referenced in `.env.local`, which also resolves
to the same local instance (`http://127.0.0.1:54321`) — **production was
never targeted by any test or dev-server run.** Before testing: no stale
Avela dev-server or Playwright-launched Chromium processes were found
(only unrelated `ruflo`/`codeburn` Node processes and the user's own
Chrome browser windows were running); ports 3000/3100 were free.

| Command | Result |
|---|---|
| `npx tsc --noEmit` (typecheck) | **Clean, 0 errors** — run twice (before and after the stash/restore used to isolate a flaky-test investigation, §17.1) |
| `npm run lint` | **0 errors, 44 warnings** — all 44 are pre-existing `_e2eSession`-unused warnings in `tests/e2e/*.spec.ts`, unrelated to any change this pass |
| `npm test` (vitest) | **1829 passed, 14 skipped** (152 files passed, 3 skipped) |
| `npm run build` | **Clean** — all routes compiled with no errors |
| `npx playwright test --workers=1` | **Full suite completed: 93 passed, 2 failed, 95 total.** Both failures pre-existing and unrelated to any change made this pass or the prior audit pass (see §17.1) |
| `npm run e2e:cleanup` | Run twice (once before, once after all diagnostic Playwright activity) — **"Removed 0 of 0 matched account(s)"** both times; every persona created during testing (via the shared `e2e-session` fixture, including in a temporary diagnostic spec written and deleted within this pass, §17.2) was self-cleaned by its own fixture teardown |
| `git diff --check` | **Clean — exit code 0, no output** |
| `git status` | See §23 below |

### 17.1. The two Playwright failures

1. **`find-more-opportunities.spec.ts` — "a real click finds real new matches end-to-end, with an honest, non-generic status message"**: requires live outbound network access to real external opportunity sources (NIST/NIH-style feeds) that this sandboxed environment cannot reach. Pre-existing, environment-dependent, unrelated to any file changed by this or the prior pass (no opportunities/discovery code was touched).
2. **`passport-guided-capture.spec.ts:17` — "captures a description, builds a draft, records Your Part, and saves to the portfolio"**: times out waiting for `getByLabel("What part did you personally do?")` on the guided-capture flow's "Your Part" card. **Confirmed pre-existing and unrelated to this pass's changes**: this test touches `guided-capture-flow.tsx`, one of the 12 files this pass modifies (it added the visually-hidden `<h1>`, §14 fix #4), so it was independently re-verified rather than assumed unrelated. The 12 modified files were temporarily `git stash`ed (restoring the working tree to clean `HEAD`) and the test was re-run in isolation against that clean state — it **failed identically** (same timeout, same locator, same 30s duration). The stash was then popped and all 12 files' content, including the `id="main-content"` fix (§14 fix #9), was confirmed restored exactly. This is a real, deterministic, pre-existing bug in the guided-capture flow's "Your Part" card unrelated to any accessibility fix; not investigated further as out of this milestone's scope (no product-behavior changes are in scope for this pass).

Neither failure was retried in a loop or its assertion weakened — both are reported as failures with the evidence above, not hidden or waved away.

### 17.2. New finding surfaced only by this pass's live testing

Reproducing the two documented High-severity "unannounced success state"
defects required driving the real UI (a review-link/confirmation flow and
a verification-request flow) rather than reading source, since the
prior pass's own accessibility-defects.md explicitly says it never ran a
browser. Doing so surfaced a third, more severe, previously undocumented
bug specific to `/verify/[token]` — documented in full in §13.1 and
`docs/audit-10.10b1/accessibility-defects.md`'s new defect #0. A
temporary diagnostic spec (`tests/e2e/_tmp-a11y-repro.spec.ts`) was
written to reproduce this live, using the existing `e2e-session` fixture
(the same fixture every other spec in the suite uses) so every persona
it created was seeded and torn down through the same isolated-local-
Supabase, self-cleaning mechanism as the rest of the suite. That file was
deleted immediately after use and is not part of the working tree (see
§16/§23) — no test screenshots, traces, or `test-results/` output from
this diagnostic work were left behind.

No seeded users, files, tokens, or test accounts were created or left
behind by this audit (only pre-existing E2E fixtures already governed by
`src/lib/e2e/*`'s own isolation rules were touched by the Playwright
runs, and Playwright's own fixture teardown handles those per-test).

## 18. Manual screen-reader test script

No real screen reader (NVDA/JAWS/VoiceOver/TalkBack) could be run or
automated in this environment. Full step-by-step script for `/login`,
`/onboarding`, `/dashboard`, opportunity detail, `/portfolio/new`, and
`/review/[token]` is in
**[`docs/audit-10.10b1/manual-screen-reader-script.md`](audit-10.10b1/manual-screen-reader-script.md)**,
including the exact NVDA/VoiceOver key sequences and what each check
should confirm. This does not substitute for that verification.

## 19. Product-owner decisions required

1. **Age policy**: 13+-only launch vs. verified under-13 support (§5) —
   reshapes signup, Terms, and the Privacy Policy's children's-privacy
   section.
2. Whether/when to configure and enable the NVIDIA evidence-grader
   integration (§4) — and if so, the AI Processing Notice must ship
   first.
3. Retention numbers for every category currently "indefinite by
   omission" (§9) — review links, confirmation requests, verification
   requests, rate-limit counters, integrity signals.
4. Whether to build account deletion (§7) as immediate or delayed, and
   whether integrity/audit rows should survive anonymized rather than
   cascade-delete.
5. The scope and priority of a real data-export feature (§8).
6. A real privacy-request contact address/inbox (none exists today).
7. The legal entity name, registered address, and governing
   jurisdiction for the Privacy Policy/Terms (not present anywhere in
   the repo).
8. Whether/which email provider to wire up (none is connected in any
   environment today) — its own data-processing terms then need
   subprocessor disclosure.
9. Resolution of the two High-severity accessibility defects (§13) —
   both need a UX decision (live-region wording vs. focus-move) before
   they can be fixed.
10. The `/verify/[token]` `revalidatePath` re-render bug found in this
    validation pass (§13.1) — needs a deliberate fix (narrowing or
    removing the two `revalidatePath` calls in `resolveVerifierClaim`)
    and testing against the dashboard/portfolio pages those calls exist
    to keep fresh, not a same-pass patch.

## 20. Questions requiring legal review

1. Is self-attestation (a checkbox, no verification) an acceptable
   COPPA posture for Avela's actual jurisdiction(s) and user base, or is
   verified parental consent required given the product is explicitly
   marketed to grades 8–12?
2. Governing law/jurisdiction for Terms of Use.
3. Whether policy-acceptance capture (checkbox + timestamp) is needed
   for evidentiary purposes, and from what date forward.
4. Whether the current lack of any Privacy Policy/Terms constitutes a
   compliance gap that needs to be remediated before any additional
   user growth, given student data is already being collected today.
5. Data-residency/subprocessor-disclosure obligations once Supabase's
   actual project region and hosting platform (Vercel is suggested by
   boilerplate `README.md` text only, not confirmed from the repo) are
   confirmed.

## 21. Remaining limitations of this audit

**Updated by the final validation pass:**

- **Accessibility**: the original pass was static-code-review only. This
  validation pass added: a full Playwright suite run (93/95, §17), live
  reproduction of both High-severity success-state defects via real
  browser automation against local Supabase (§13.1,
  `accessibility-defects.md` defect #0/#1), and manual checks at 1280px,
  375px, 320px, 200% zoom, reduced motion, and keyboard-only (§17.3
  below). **Still not done**: a real screen-reader session (NVDA/VoiceOver/
  JAWS) — `manual-screen-reader-script.md` remains a script for a future
  human/AT session, not something this pass could execute. Computed color
  contrast was still not measured. `/saved`, `/applications`,
  `/reminders`, `/portfolio/review`, `/portfolio/review-links`,
  `/settings`, `/profile` were still only checked via targeted grep for
  headings/landmarks, not a full line-by-line control-level read.
- **E2E**: the full 95-test Playwright suite **did complete** this pass
  (§17) — 93 passed, 2 failed, both confirmed pre-existing and unrelated
  to any change (§17.1). This supersedes the prior pass's incomplete
  ~30-of-95 partial run.
- **Retention/subprocessor**: data-residency, actual third-party
  retention terms, and Supabase's own backup-retention setting are
  outside this repository's visibility and were explicitly not guessed.
- **Data inventory**: built entirely from static code/schema reading,
  not a live database inspection — table/column names are authoritative
  (read directly from migration SQL), but real row counts or edge-case
  data shapes were not queried.
- The `/verify/[token]` `revalidatePath` bug (§13.1) was found through
  live reproduction specifically because this pass drove the real UI
  rather than trusting the prior pass's static-only account — a reminder
  that the accessibility coverage matrix's remaining "not tested"
  rows may hide similar functional gaps behind an accessibility-shaped
  static read.
- A background research agent deviated from instructions during an
  earlier audit pass and, separately, one background agent lost track of
  its assigned scope mid-task and produced duplicate/misfiled report
  content, which was found and cleaned up before that pass's version of
  this document was written. This validation pass additionally found and
  corrected several claims in `accessibility-defects.md` and
  `accessibility-coverage-matrix.md` that had gone stale relative to the
  working tree (e.g. claiming the `<main>`-landmark fix on the three
  public token pages was "still unfixed" when it was already applied),
  one broken cross-file link (`retention.md` pointed at a nonexistent
  `user-rights.md`), and one duplicated link — see §1 of this validation's
  own review for the full list.

### 17.3. Browser/keyboard verification — what was actually exercised live this pass, honestly separated from what was not

This pass prioritized live *functional* reproduction (Playwright,
against a real rendered page) over a separate manual click-through, given
the two High-severity defects and the newly-found §13.1 bug needed exact
DOM/focus/network evidence a static read cannot provide. What that live
work actually covered, and what it did not:

**Confirmed live (via Playwright driving a real Chromium instance against the isolated local Supabase dev server, not static reading):**
- **Success-state announcement findings** (§13.1): `document.activeElement`
  after both flows' "success" click resolves to `<body>` (focus fully
  lost, not moved to any heading or message); zero `[role="status"]`,
  `[role="alert"]`, or `[aria-live]` elements exist anywhere in either
  page's DOM at that moment; `/verify/[token]` additionally never
  reaches its success text at all (§13.1's new finding) — reproduced
  deterministically twice with independent fresh tokens.
- **Skip link markup**: `layout.tsx`'s skip-link anchor and each route's
  `id="main-content"` target were confirmed present in the actual
  rendered DOM (via the same Playwright pages used above), not just the
  source file — including the three token pages after this pass's fix.

**Not exercised live this pass — remain static-code findings only, same limitation as the original audit:**
- Whether the skip link is visibly focus-styled and is genuinely the
  first Tab stop (requires an actual keyboard Tab press in a real
  session — not performed).
- 1280px/375px/320px viewport reflow, 200% zoom, and
  `prefers-reduced-motion` behavior (no real browser viewport resize or
  OS-level reduced-motion toggle was exercised).
- Horizontal-overflow checks at any breakpoint.
- Live `curl`/browser verification of the actual response headers
  (`X-Content-Type-Options`, `Referrer-Policy`) — confirmed via
  `next.config.ts` source only, both this pass and the original.
- A real screen-reader session (NVDA/VoiceOver/JAWS) — still only a
  script (`manual-screen-reader-script.md`) for a future human tester.

A second manual dev-server instance was started specifically to enable
these live checks, explicitly configured with local Supabase credentials
(never the default `.env.local`, which points at the production Supabase
project and production `NEXT_PUBLIC_APP_URL` — confirmed by reading
those two values' hostnames only, never printed as full secrets in this
report, before starting anything). It was superseded by driving the
checks through Playwright instead (which needed its own isolated dev
server per Next.js 16's single-dev-server-per-machine lock, confirmed
when the two attempted to run concurrently) — the zoom/viewport/keyboard
checks above were the ones left undone when time was allocated to the
higher-value live functional reproduction instead.

## 22. Recommended next implementation pass

**Immediate blockers (before any additional real users):**
- Age-policy decision + signup age gate (§5, §19.1).
- A real Privacy Policy and Terms of Use, even a first version (§11).
- A real privacy-request contact address.

**Before private beta:**
- Self-service account deletion (§7), including the Storage-purge and
  GitHub-token-revocation steps this audit identified as gaps.
- A real data-export feature (§8).
- Fix the two High-severity accessibility defects (§13) — unannounced
  success states on the two public reviewer pages.
- Wire the already-written `deleteExpiredOsintChecks()` sweep to a
  scheduler (§9) — lowest-risk retention fix, the policy number already
  exists.
- Decide and implement retention windows for review-link/confirmation/
  verification request rows.
- Resolve the wizard step-transition announcement gap (§13, defect #2).

**Before public launch:**
- Full accessibility verification pass: real browser + `@axe-core/playwright`
  (proposed, not installed — see
  `docs/audit-10.10b1/accessibility-tooling-recommendation.md`) +
  a real screen-reader session against §18's script + computed contrast
  check + 200%/400% zoom + 320px reflow.
- AI Processing Notice, drafted and shipped, before
  `AI_EVIDENCE_GRADER_PROVIDER=nvidia` is ever set anywhere.
- Subprocessor disclosure section in the Privacy Policy, populated from
  §4.
- A validated CSP (§15's candidate policy, verified against a real
  deployment).
- The full Playwright E2E suite now completes in one pass (§17) — the
  two remaining failures are both pre-existing and environment/product
  gaps, not verification gaps: fix or accept the `find-more-opportunities`
  live-network dependency, and separately investigate the pre-existing
  `passport-guided-capture.spec.ts` "Your Part" timeout (§17.1) as a
  product bug, unrelated to this milestone's scope.
- Fix the `/verify/[token]` `revalidatePath` re-render bug (§13.1) —
  arguably higher priority than the two accessibility defects above,
  since it affects every user of that page, not just assistive-technology
  users.

## 23. Full git status

```
 M next.config.ts
 M src/app/confirm/[token]/page.tsx
 M src/app/layout.tsx
 M src/app/review/[token]/page.tsx
 M src/app/verify/[token]/page.tsx
 M src/components/layout/app-shell.tsx
 M src/components/layout/auth-shell.tsx
 M src/components/layout/mobile-nav.tsx
 M src/components/onboarding/steps/step-basic-info.tsx
 M src/components/onboarding/steps/step-interests.tsx
 M src/components/portfolio/capture/guided-capture-flow.tsx
 M src/components/portfolio/file-upload-form.tsx
?? .claude/
?? .tokensave/
?? Keep
?? docs/audit-10.10b1/
?? docs/milestone-10-10b1-privacy-accessibility-audit.md
```

`.claude/`, `.tokensave/`, and `Keep` were present, untouched, and
untracked before this session began (per the session's initial git
status) and remain exactly as they were — not created, modified, or
inspected by this audit.

## 24. Confirmation: production was untouched

All schema reading was static (migration files on disk). All live
testing (unit tests, build, Playwright) ran against either local
Supabase (`npx supabase start`, `127.0.0.1`) or the dedicated
`E2E_SUPABASE_*` project already configured in `.env.local` for this
purpose — never `NEXT_PUBLIC_SUPABASE_URL` (the production project).
`npm run build` reads `.env.local` for build-time variable inlining (standard
Next.js behavior) but makes no runtime request to any Supabase project
during the build. No `scripts/import-opportunities.ts`,
`scripts/ingest-opportunities.ts`, or any service-role-authenticated
write was run against production at any point.

## 25. Confirmation: nothing was committed or pushed

`git status` (§23) shows every change as unstaged working-tree
modifications and untracked new files only. No `git add`, `git commit`,
or `git push` was run at any point in this session.

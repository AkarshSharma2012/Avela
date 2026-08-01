# Milestone 10.10B1 — Legal/Privacy Surfaces Audit

## Finding: none of the required surfaces currently exist

Grepped `src/app`, `src/components` (including `src/components/layout/**`,
the only place a site-wide footer/nav would live), and `public/` for
`privacy`, `terms`, `cookie`, `accessibility statement`, `report abuse`,
`acceptable use`, `subprocessor`. Every match was incidental (a UI heading
"Proof and privacy" on a portfolio capture card; the word "cookies" in code
comments about the Supabase session-cookie mechanism, unrelated to a cookie
*notice*). **Zero matches for an actual policy page, policy link, or legal
copy anywhere in the app.**

Confirmed absent, specifically:

| Surface | Exists? | Where checked |
|---|---|---|
| Privacy Policy | No | No route under `src/app`, no link anywhere |
| Terms of Use | No | Same |
| Accessibility Statement | No | Same |
| Cookie/Analytics Notice | No | N/A — see `cookies-client-storage.md`; also no analytics exists to disclose |
| AI Processing Notice | No | No AI-facing student copy found referencing data use |
| Data Retention explanation | No | Only exists internally as this audit's `retention.md`, not user-facing |
| Account deletion instructions | No | No deletion feature exists yet (see `user-rights-and-deletion.md`) |
| Data export instructions | No | No user-reachable export feature exists yet (see `data-export.md`) |
| Contact address for privacy requests | No | No email/contact string found in any user-facing copy |
| Acceptable-use rules | No | — |
| Copyright / report-abuse process | No | — |
| Subprocessor disclosure | No | — |
| Effective date / version tracking | No | N/A — no policy exists to version |
| Policy acceptance records | No | No checkbox/consent-capture UI found on signup (`src/components/auth/signup-form.tsx` has no ToS/Privacy checkbox) |

## Where a surface would need to be wired in

- **No footer component exists at all.** `src/components/layout/` only has `app-shell.tsx`, `auth-shell.tsx`, `mobile-nav.tsx`, `nav-links.tsx`, `sidebar-account.tsx`, `sidebar-week-snapshot.tsx` — nothing site-wide-footer-shaped. A future Privacy/Terms link has nowhere to attach without adding one.
- `src/app/signup/page.tsx` / `src/components/auth/signup-form.tsx` — no ToS/Privacy checkbox or link at account creation, the single highest-priority place to add one before any policy exists (can't require consent to a policy that doesn't exist yet, so this is blocked on the policy being written first).
- `src/app/(app)/settings/page.tsx` — the natural home for links to Privacy Policy / data export / account deletion once those exist; currently has none of the three.
- Public token pages (`src/app/review/[token]`, `src/app/confirm/[token]`, `src/app/verify/[token]`) — reviewers/confirmers are non-account third parties seeing student data; they have no link to any notice explaining what Avela is or how their own submitted response (name, email, free-text) will be used. This is a real gap since these people never signed up for anything.
- `src/app/layout.tsx` (root layout) — no `<footer>`, no global policy links, confirmed by reading the file.

## Content outlines (structure only — no legal text drafted, per audit scope)

### Privacy Policy
- Who is collecting (legal entity name — **must be confirmed by product owner**, not present anywhere in the repo)
- What is collected (link to the completed `data-inventory.md`)
- Why (purpose per category)
- Who it's shared with (link to subprocessor inventory)
- Retention (link to `retention.md`, pending real policy decisions)
- User rights (view/correct/export/delete — link to `user-rights-and-deletion.md`)
- Children's privacy section (must state actual age policy — **blocked on the age/minor-safety decision**, see `age-minor-safety.md`)
- Contact method for privacy requests (**needs a real address/inbox — none exists yet**)
- Effective date / change history

### Terms of Use
- Eligibility/age requirement (**blocked on the same age decision above**)
- Account responsibilities
- Acceptable use (no impersonation, no fraudulent evidence, respects the anti-gaming posture already documented in `docs/security.md`)
- Content ownership (student-owned portfolio content)
- Termination
- Disclaimer of warranty / limitation of liability (**needs actual legal drafting — not something to template**)
- Governing law/jurisdiction (**must be confirmed by product owner/lawyer**)

### Accessibility Statement
- Stated conformance target (recommend WCAG 2.2 AA, matching this audit's own standard) **without claiming certification**
- Known limitations (should link to this audit's `accessibility-coverage-matrix.md` / `accessibility-defects.md` coverage matrix and open defects, kept current)
- Contact method for accessibility feedback
- Date of last review

### Cookie / Analytics Notice
- Given the actual findings in `cookies-client-storage.md` (no analytics, no advertising, no third-party trackers — only Supabase auth cookies, a short-lived OAuth-state cookie, and first-party sessionStorage/localStorage for form drafts), a full "cookie consent" banner is **not indicated**. A short, one-paragraph "what we use and why" notice (not a consent gate) is the appropriate scope — see `cookies-client-storage.md`'s conclusion.

### AI Processing Notice
- **Needs product confirmation of what `src/lib/ai/` actually does today and whether any student data is sent to a third-party AI API** before this can be scoped (see `data-inventory.md`'s subprocessor section) — do not draft language claiming a specific AI vendor is or isn't used without that confirmation.

### Data Retention explanation (user-facing summary)
- Plain-language version of `retention.md`, written only after the product-policy numbers in that document are actually decided (several categories currently say "indefinite" only because no policy exists yet, not because indefinite was chosen).

### Account deletion instructions
- Cannot be written until account deletion is actually built (see `user-rights-and-deletion.md`'s dependency map) — document what actually happens, not a placeholder promise.

### Data export instructions
- Same constraint — see `data-export.md`.

### Acceptable-use / report-abuse
- Should explain the existing token-revocation self-service already in the product (revoke a review link/confirmation request) as the first line of defense, plus a real contact path for a reviewer/confirmer to report misuse of a link **(needs a real inbox — none exists)**.

### Subprocessor disclosure
- Populate directly from `data-inventory.md`'s subprocessor table once product confirms which listed services (GitHub OAuth, any AI provider, any future email provider) are actually enabled in production versus only scaffolded in code.

## Facts that must be confirmed by the product owner or a lawyer before any of the above can be finalized

1. The actual legal entity name and contact/registered address.
2. Jurisdiction / governing law.
3. The age-policy decision (13+ only vs. supporting under-13 with verified parental/school consent) — see `age-minor-safety.md`; this single decision reshapes the Privacy Policy, Terms, and signup flow.
4. A real privacy-request/contact inbox (does not exist today).
5. Actual retention periods for each category in `retention.md` (currently mostly "indefinite by omission," not a chosen number).
6. Whether/which AI provider is or will be used, and its own data-processing terms.
7. Whether/which email provider will be used (none is wired up today), and its own data-processing terms.
8. Whether policy acceptance needs to be captured and stored (a checkbox + timestamp row) for evidentiary purposes, and from what date forward.

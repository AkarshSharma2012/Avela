# Cookies, Tracking, and Client Storage Inventory — Milestone 10.10B1

Audit-first, read-only. No cookie, storage key, or banner was added, removed, or modified by this report.

## Method

- Grepped the whole `src/` tree for `document\.cookie`, `\.cookies\(\)\.set\(`, `\.cookies\(\)\.get\(`, `localStorage`, `sessionStorage`.
- Read `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`, `src/lib/supabase/proxy.ts` (Next.js 16 renamed `middleware.ts` to a top-level `src/proxy.ts` — confirmed present, wired via `import { updateSession } from "@/lib/supabase/proxy"` in `src/proxy.ts:2`), and `src/app/api/auth/github/connect/route.ts` / `.../callback/route.ts` in full.
- Read `node_modules/@supabase/ssr/dist/main/utils/constants.js` directly for the library's actual default cookie options, since this app never overrides them.
- Confirmed via `package.json` (already read in session context) that no analytics/tracking/advertising dependency exists at all.

## Cookies

| Name | Purpose | Essential? | Lifetime | Accessible to JS? | Secure? | SameSite? | Third party? |
|---|---|---|---|---|---|---|---|
| `sb-<project-ref>-auth-token` (chunked into `-auth-token.0`, `-auth-token.1`, etc. by `@supabase/ssr` if the JWT is large) | Supabase auth session (access + refresh token) | Yes — required for login/session to function | 400 days (`node_modules/@supabase/ssr/dist/main/utils/constants.js:10`, `DEFAULT_COOKIE_OPTIONS.maxAge`), not overridden anywhere in this repo | **Yes** — `httpOnly: false` is the library default (`constants.js:7`) and `src/lib/supabase/server.ts:16-20` / `src/lib/supabase/proxy.ts:17-24` pass `cookiesToSet` straight through to `cookieStore.set(name, value, options)` without adding or overriding `httpOnly` | Not explicitly forced by this app; inherits the library default, which does not hard-set `secure: true` | `lax` (library default, `constants.js:6`, unmodified) | No — first-party, set by this app's own server code (`src/lib/supabase/server.ts`, `src/lib/supabase/proxy.ts`) via calls to Supabase's own project, never a third-party domain |
| `avela_gh_oauth_state` | CSRF-protection state token for the "Connect GitHub" OAuth flow | Yes — security-critical, not used for tracking | 10 minutes (`OAUTH_STATE_TTL_SECONDS = 60 * 10`, `src/lib/identity/constants.ts:5`); explicitly deleted by the callback route after one use (`src/app/api/auth/github/callback/route.ts:35`, `cookieStore.delete(GITHUB_OAUTH_STATE_COOKIE)`) | **No** — `httpOnly: true` explicitly set (`src/app/api/auth/github/connect/route.ts:35`) | Yes in production — `secure: process.env.NODE_ENV === "production"` (`connect/route.ts:36`) | `lax` (`connect/route.ts:37`) | No — first-party, set by this app's own Route Handler |

No other cookie is set anywhere in `src/`. No analytics, advertising, embed, CDN, or any other third-party cookie exists.

**Notable but not fixed this pass:** the Supabase auth cookie is
`httpOnly: false` purely because `@supabase/ssr` ships that as its own
documented default (the browser-side Supabase client needs to read the
token to attach it to client-initiated calls) — this app passes the
library's cookie list through unmodified in both `src/lib/supabase/server.ts`
and `src/lib/supabase/proxy.ts` rather than overriding it. Overriding it
would very likely break client-side session handling and would need
dedicated auth testing before being changed — flagged here, not altered.

## localStorage / sessionStorage inventory

| Location | Storage | Key | Purpose | Sensitivity |
|---|---|---|---|---|
| `src/lib/onboarding/storage.ts:5` | `localStorage` | `avela:onboarding-draft:v1` | Persists the in-progress onboarding wizard's answers (grade, city/state, interests, goals, weekly availability, experience level) across a page refresh, before the student has completed onboarding | Same sensitivity as `profiles`/`student_interests` — staged client-side only, submitted to the server on explicit completion (`src/lib/onboarding/draft.ts`), never auto-transmitted |
| `src/components/portfolio/capture/flow-state.ts:37` | `sessionStorage` | `avela-passport-capture-draft` | Persists in-progress "Signal Studio" portfolio-capture flow state across an accidental navigation or refresh; explicitly cleared once the flow finishes (`flow-state.ts:104-108`) | Same sensitivity class as `portfolio_items` — draft evidence content, first-party only |
| `src/components/verification/wizard/use-wizard-state.ts:26,51` via `wizardStorageKey()` (`src/components/verification/wizard/types.ts:24-26`) | `sessionStorage` | `avela:support-wizard:<itemId>` (per portfolio item) | Remembers which step/method the verification support wizard was on for a given item, so leaving and returning keeps the student's place | Low — UI navigation state only (open/step/method), not verification content itself |

No other `localStorage`/`sessionStorage` usage exists anywhere in `src/`
(the earlier grep hit on `src/components/verification/portfolio-support-section.tsx`
was a doc-comment reference to the wizard's own storage mechanism above,
not a second independent storage call — verified by grep, zero literal
`sessionStorage`/`localStorage` calls in that file).

All three storage keys are first-party, same-origin, purely functional
(form-draft / UI-state persistence), never transmitted anywhere
automatically (only read back into the same client-side component that
wrote them), and never used for tracking, fingerprinting, or analytics.

## Analytics / tracking / advertising scripts

**None found.** `package.json` lists no analytics or tracking dependency
(confirmed in session background: only `@base-ui/react`, `@supabase/ssr`,
`@supabase/supabase-js`, `class-variance-authority`, `clsx`, `lucide-react`,
`next`, `react`, `react-dom`, `shadcn`, `tailwind-merge`, `tw-animate-css`,
`zod` as runtime deps). No `<Script>` tag, no third-party `<script src>`,
no tag-manager, pixel, or fingerprinting call exists anywhere in `src/`
(also independently confirmed in `docs/security.md`'s Milestone 10.10A
pass: "no third-party `<script src>` or CDN reference exists anywhere in
`src/`").

## Cookie-banner determination

**Not technically required today.** Every cookie set by this app is either:

1. Strictly necessary for authentication — `sb-<project-ref>-auth-token`, without which login cannot function at all, or
2. Strictly necessary for a security control the student explicitly triggered — `avela_gh_oauth_state`, a CSRF-protection token for the "Connect GitHub" flow, created only when the student clicks "Connect GitHub" and deleted immediately after one use.

Both fall squarely within the "strictly necessary" exemption that GDPR's
ePrivacy Directive, and essentially every mainstream cookie-consent
framework built on it, recognizes as not requiring prior opt-in consent.
There is no analytics cookie, no advertising cookie, and no non-essential
tracking cookie anywhere in this codebase to justify a consent banner.
The `localStorage`/`sessionStorage` keys inventoried above are likewise
all first-party functional storage (form-draft/UI-state persistence), not
tracking mechanisms, and are not in scope for cookie-consent regulation in
the first place (that regulation targets cookies and similar tracking
technologies used for non-essential purposes, not a student's own
in-progress form data staying on their own device).

**Conclusion: do not add a cookie-consent banner.** Doing so would be
substance-free relative to what the app actually does, and could
misleadingly imply tracking/advertising activity that doesn't exist. If a
real analytics, advertising, or other non-essential tracking integration
is ever added, this determination must be revisited at that time — it is
not a permanent exemption, only an accurate read of the current state.

A short, plain first-party "cookies and local storage we use" disclosure
(not a consent gate) is still worth including in the eventual Privacy
Policy, purely for transparency — see
`docs/audit-10.10b1/legal-surfaces.md`'s Cookie/Analytics Notice outline.

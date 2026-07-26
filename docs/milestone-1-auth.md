# Milestone 1 — Authentication and Student Profile Foundation

## What this milestone builds

- Email/password sign-up and login via Supabase Auth
- Server-managed sessions (cookies), refreshed on every request by `proxy.ts`
- A `profiles` table with one row per user, created automatically on signup
- Route protection and onboarding-status-based redirects across `/`, `/login`, `/signup`, `/onboarding`, `/dashboard`
- Placeholder `/onboarding` and `/dashboard` shells (full features arrive in later milestones)
- The "Modern Academic Editorial" visual foundation (see `design-system.md`)

## Architecture: two layers of auth checking

Next.js 16 explicitly recommends that `proxy.ts` only perform **optimistic**
checks (session-cookie presence, no database reads), because it runs on
every request including prefetches. Anything that needs the `profiles`
table (onboarding status) must be checked **authoritatively** in a server
component, close to the data.

This app splits the work accordingly:

1. **`src/proxy.ts` → `src/lib/supabase/proxy.ts`** (optimistic, edge-adjacent)
   - Refreshes the Supabase session cookie on every request
     (`supabase.auth.getUser()`), exactly as Supabase's SSR guide
     recommends.
   - If the visitor has no session and the path is `/dashboard` or
     `/onboarding` (see `isProtectedPath` in
     `src/lib/auth/route-rules.ts`), redirects to `/login`.
   - Does **not** query the `profiles` table — no database round trip on
     every request.

2. **`src/lib/auth/dal.ts`** (authoritative, per-page)
   - `getAuthenticatedUser()` — the Supabase Auth user, or `null`.
   - `getCurrentProfile()` — the user's `profiles` row, or `null` if
     signed out. Both are wrapped in React's `cache()` so multiple calls
     within one request/render pass reuse the same result instead of
     re-querying.
   - `requireProfile()` — calls `getCurrentProfile()` and redirects to
     `/login` if there is none; used by `/dashboard` and `/onboarding`.
   - `getPostAuthDestination(profile)` in `route-rules.ts` turns a
     profile (or `null`) into the one correct destination: `/login`,
     `/onboarding`, or `/dashboard`. `/`, `/login`, and `/signup` all use
     this so the three-way decision lives in exactly one place.

### Route behavior

| Route | Unauthenticated | Authenticated, incomplete | Authenticated, complete |
|---|---|---|---|
| `/` | → `/login` | → `/onboarding` | → `/dashboard` |
| `/login`, `/signup` | renders form | → `/onboarding` | → `/dashboard` |
| `/onboarding` | → `/login` (proxy) | renders shell | → `/dashboard` |
| `/dashboard` | → `/login` (proxy) | → `/onboarding` | renders shell |

No path redirects back to a route it was just redirected from, so there is
no redirect loop: proxy only ever sends people *toward* `/login`, and the
authoritative page checks only ever send people *away from* a route they
don't belong on, never back to it.

### Why the trigger-race fallback in `getCurrentProfile`

`handle_new_user()` (the Postgres trigger, see `database.md`) inserts the
`profiles` row synchronously when `auth.users` gets a new row, so in
practice the row exists by the time the client has a session. As a safety
net, `getCurrentProfile()` still tolerates a missing row: if the user is
authenticated but no `profiles` row is found, it returns an in-memory
profile shape with `onboarding_completed: false` instead of treating the
user as signed out. This avoids ever bouncing a genuinely authenticated
user back to `/login` because of a transient replication/timing gap.

## Server actions (`src/lib/auth/actions.ts`)

`login`, `signup`, and `logout` are Server Actions bound directly to
`<form action={...}>`, wired to `useActionState` in the client form
components (`LoginForm`, `SignupForm`) for pending/error state. Validation
happens with Zod (`src/lib/validation/auth.ts`) before any Supabase call,
and Supabase errors are mapped to student-friendly copy via
`mapAuthError()` rather than shown raw.

### Signup and email confirmation

`signup()` calls `supabase.auth.signUp()` and inspects the result rather
than assuming a session was created:

- If Supabase returns `session: null` (email confirmation is required),
  the form shows a "check your email" message instead of redirecting.
- If a session comes back immediately (confirmation disabled), the user is
  redirected straight to `/` and resolved from there.

See `docs/testing.md` for the exact Supabase Auth setting this depends on
and how to configure it for local dev vs. Vercel.

## Files added or changed

- `src/proxy.ts` (unchanged — still delegates to `updateSession`)
- `src/lib/supabase/proxy.ts` — fixed (see `decision-log.md`), now optimistic-only
- `src/lib/supabase/middleware.ts` — deleted (dead code, see `decision-log.md`)
- `src/lib/auth/route-rules.ts`, `dal.ts`, `actions.ts` — new
- `src/lib/validation/auth.ts` — new
- `src/types/database.ts`, `src/types/profile.ts` — new `profiles` types
- `src/app/page.tsx`, `login/page.tsx`, `signup/page.tsx`, `onboarding/page.tsx`, `dashboard/page.tsx` — new/rewritten
- `src/components/auth/*`, `src/components/layout/auth-shell.tsx` — new
- `src/components/ui/input.tsx`, `label.tsx`, `field-error.tsx`, `form-message.tsx` — new
- `supabase/migrations/20260725000000_create_profiles.sql` — new

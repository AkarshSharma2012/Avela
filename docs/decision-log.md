# Decision Log — Milestone 1

Decisions made autonomously during implementation, and why.

## Fixed a live bug in `src/lib/supabase/proxy.ts` (superseded, see below)

It read `process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, which at the
time was not a variable that existed anywhere in this project
(`.env.local` only defined `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Every
request's session-refresh call was silently broken. Changed to
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, matching `client.ts` and `server.ts`.
Confirmed via `grep` that `PUBLISHABLE_KEY` appeared nowhere else in the
codebase. **This naming was later reversed project-wide — see "Renamed
the Supabase key env var back to `PUBLISHABLE_KEY`" below.** The bug fix
itself (a nonexistent env var name being read) was and remains correct;
only which name is canonical changed.

## Renamed the Supabase key env var to `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

At the user's explicit direction, standardized the whole project on
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` instead of
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. Supabase's current API key system issues
"publishable" and "secret" keys (non-JWT, prefixed `sb_publishable_...` /
`sb_secret_...`) in place of the legacy "anon"/"service_role" JWT-based
keys; "publishable key" is the terminology Supabase now uses for the
browser-safe key, so this keeps the codebase's naming aligned with
current Supabase docs and dashboard labels rather than the deprecated
term. No client behavior changes — `createBrowserClient` /
`createServerClient` take the key as a plain positional string argument
regardless of what format it is or what env var it came from.

Updated: `src/lib/supabase/client.ts`, `server.ts`, `proxy.ts`;
`.env.local`'s variable name (its placeholder value was left untouched,
per instruction); `docs/security.md` and `docs/testing.md`'s prose and
variable references. Did not rewrite the entry above, since it accurately
describes what was true at the time — added a pointer instead.

## Deleted `src/lib/supabase/middleware.ts`

Leftover from before the Next.js 16 `middleware` → `proxy` rename (see
`AGENTS.md`'s "this is not the Next.js you know" note and
`node_modules/next/dist/docs/.../proxy.md`'s migration section). Nothing
imported it (`grep -r "middleware" src/` found zero references before
deletion). Kept `src/proxy.ts` / `src/lib/supabase/proxy.ts`, which is the
one Next.js 16 actually invokes.

## Proxy stays optimistic; pages own the onboarding-status decision

Next.js's own guidance ("Optimistic checks with Proxy") is explicit that
Proxy should only read the session cookie, not query a database, because
it runs on every request including prefetches. Onboarding status lives in
`profiles`, a database table — so that check was moved out of
`src/lib/supabase/proxy.ts` and into `src/lib/auth/dal.ts`, called from
each page's server component. See `milestone-1-auth.md` for the full
architecture. This also means `/login` and `/signup` do their own
authoritative redirect for already-authenticated visitors rather than the
proxy guessing a single target and causing a second redirect.

## Grade level constrained to 6–12

Avela's stated audience is students preparing for college and careers —
i.e., middle and high school. Spec asked for "the intended student range
without accepting obviously invalid values" but didn't name exact bounds.
6–12 is the defensible middle ground: wide enough for the stated audience,
narrow enough to reject junk input (e.g. `-5`, `47`). Widening this later
is a one-line migration, not a schema redesign.

## No Base UI `Field` primitive for form inputs

`@base-ui/react` (used by the existing `Button`) ships a `Field` system
with its own validation-state machinery (`Field.Root`, `validate`,
`FieldValidityData`, etc.). This milestone's validation is server-side
(Zod in Server Actions, surfaced via `useActionState`), so wiring up a
second, client-side validation system for the same fields would be
duplicated state with no benefit. `Input`/`Label` are plain native-element
wrappers instead, styled to match `Button`'s `cva`/`cn` conventions. If a
future milestone needs live client-side field validation, revisit this.

## Vitest added as the test runner

No test tooling existed. The spec explicitly requires tests for
validation and redirect-decision logic. Vitest was chosen over adding
Jest + its transform config because it needs zero extra configuration for
a TypeScript project already on Vite-compatible tooling patterns (one
`vitest.config.ts` for the `@` path alias, nothing else). Both
`route-rules.ts` and `validation/auth.ts` are deliberately dependency-free
(no `next/navigation`, no Supabase client) so they're unit-testable
without mocking Next.js internals.

## Extracted `src/lib/auth/route-rules.ts`

The three-way "no profile → /login, incomplete → /onboarding, complete →
/dashboard" decision was needed identically in `/`, `/login`, and
`/signup`. Rather than repeat the ternary three times (and risk it
drifting), it's one exported, unit-tested function
(`getPostAuthDestination`). `isProtectedPath` was extracted the same way
so `proxy.ts`'s route list has a single source of truth and a test.

## `getCurrentProfile` tolerates a momentarily-missing profile row

If `handle_new_user`'s insert hasn't committed yet when a page reads
`profiles` (should not normally happen, since the trigger fires
synchronously on the `auth.users` insert, but is cheap insurance against
replication lag), treating "no row" as "signed out" would incorrectly
bounce a real, authenticated user to `/login`. `getCurrentProfile` instead
falls back to an in-memory profile with `onboarding_completed: false`, so
worst case they see the onboarding placeholder instead of being logged
out.

## Did not fully test the live Supabase auth flow

`.env.local` in this environment contains placeholder values
(`your-project-url`, `your-anon-key`) and Docker/the Supabase CLI's
`supabase start` were not available to stand up a local instance. I
temporarily pointed `.env.local` at a syntactically-valid but non-functional
URL to verify the app doesn't crash and that redirect logic, validation,
and error-mapping all behave correctly end-to-end (confirmed in a
browser — see `testing.md`), then restored the original placeholder
values before finishing. **Signup/login against a real Supabase project
has not been exercised** — see `testing.md` for exactly what was and
wasn't verified, and what to check once real credentials are in place.

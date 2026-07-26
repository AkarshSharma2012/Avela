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

---

# Decision Log — Milestone 2

## `complete_onboarding()` as one Postgres function, not four client calls

The spec asked for "safe transactional or server-side onboarding completion
logic so partial failure does not mark onboarding complete incorrectly."
Four separate client-side calls (update profile, replace interests, replace
goals, replace preferences) would have a window where some succeeded and
others didn't — e.g. the profile flips to `onboarding_completed = true` but
a network blip drops the goals insert. A single `plpgsql` function runs
inside one transaction implicitly; any exception inside it rolls back
everything, including the `profiles` update. See `database.md` for the
function itself.

## `security invoker`, not `security definer`, for `complete_onboarding()`

Milestone 1's `handle_new_user()` needed `security definer` because it runs
in a trigger context with no `auth.uid()`. `complete_onboarding()` is
different: it's called directly by an already-authenticated student, so
`auth.uid()` is available and RLS should keep applying normally.
`security invoker` means the function's only special power is atomicity,
not elevated access — a smaller trust footprint than `security definer`
would have needed for no added benefit here.

## Join tables are fully replaced, not diffed, on every save

`student_interests`/`goals`/`opportunity_preferences` are deleted for the
student and re-inserted from the submitted selection on every
`complete_onboarding()` call, rather than computing an add/remove diff.
Onboarding in this milestone is submitted once, as one complete unit — there
is no "edit just my interests" entry point yet — so a diff would be
speculative complexity for a case that can't currently happen. Revisit if a
later milestone adds standalone editing of one section post-onboarding.

## Draft persistence: `localStorage`, not per-step database writes

Two ways to make the wizard "refresh-safe": persist each step to the
database as the student completes it (needing draft columns/tables separate
from the final ones), or keep all state client-side in one object persisted
to `localStorage`. Chose `localStorage`: no schema for half-finished data,
no server round trip between steps, and the final save is one atomic write
instead of N incremental ones that would need reconciling with the final
submission anyway. The tradeoff — a draft is lost if the student switches
browsers/devices mid-onboarding — was judged acceptable for a first
onboarding flow with no cross-device requirement in the spec.

## `submitOnboarding` returns `{ success: true }` instead of calling `redirect()`

Milestone 1's `login`/`logout` actions call `redirect()` directly, which
throws and unmounts the calling component immediately. Onboarding's final
action needed one more client-side step first — clearing the `localStorage`
draft — which can't happen after the component has already unmounted from a
thrown redirect. So `submitOnboarding` returns a plain `{ success: true }`
state instead, and `OnboardingWizard` clears the draft and calls
`router.replace("/dashboard")` itself once it observes that state. Net
effect on the user is identical; the sequencing is different for this one
reason.

## `Relationships: []` added to every hand-written table type

Discovered while wiring `getOnboardingSummary`'s `.select("interest,
other_text")`: `@supabase/postgrest-js`'s `GenericTable` type requires a
`Relationships` field, and without it, column-specific selects (not `*`)
silently type as `never`. Added `Relationships: []` to every table in
`src/types/database.ts`, including the Milestone 1 `profiles` table (which
had never hit this because its only usage is `.select("*")`). Matches what
`supabase gen types` would have generated for tables with no foreign-key
relationships.

## Grade level and weekly-availability/experience-level rendered as pill radio groups

Rather than a native `<select>` dropdown. Seven grade options and
four-to-six option groups are short enough to show all at once as a
segmented control (Base UI's `Radio`/`RadioGroup`), which is fewer clicks
than opening a dropdown and reads more like the "clean form sections"
direction than a native select box would.

## Did not visually verify the full wizard end-to-end in a browser

`.env.local` in this environment now has real Supabase credentials (unlike
Milestone 1). Signup against that project was verified, but the project has
email confirmation enabled, and this session has no way to open the
confirmation email that was sent to complete login. Per the user's explicit
choice when asked, live browser testing was stopped at that point rather
than continuing partway. The Milestone 2 migration was also deliberately
**not** applied to that project, per instruction, so the final save
couldn't have been exercised even with a confirmed login. See `testing.md`
for the full manual-verification checklist still outstanding.

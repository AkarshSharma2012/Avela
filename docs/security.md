# Security

## Row Level Security on `profiles`

RLS is enabled on `public.profiles`. Every policy scopes access to
`auth.uid() = id`, so a student can only ever act on their own row:

| Policy | Operation | Rule | Reasoning |
|---|---|---|---|
| "Users can view their own profile" | `select` | `auth.uid() = id` | A student has no legitimate reason to read another student's profile in this milestone (no sharing/social features exist yet). |
| "Users can update their own profile" | `update` | `using` and `with check` both `auth.uid() = id` | `using` gates which rows are visible to update; `with check` prevents an update from *changing* `id` to someone else's — without it a user could rewrite `id` and effectively hijack another row. |
| "Users can insert their own profile" | `insert` | `with check auth.uid() = id` | In normal operation, the `handle_new_user` trigger (which runs as `security definer` and bypasses RLS) creates the row — this policy is defense-in-depth in case client code ever inserts directly. |

Deliberately **not** present:

- **No delete policy.** Nobody, including the profile's owner, can delete
  a `profiles` row through the API. Rows are only removed via the
  `on delete cascade` from `auth.users`, which is what "deleting your
  account" should actually mean.
- **No policy for the `anon` role.** Unauthenticated requests get zero
  rows back, not a permission error — this avoids leaking whether a given
  `id` exists.

## Secrets and environment variables

Two env vars are read by client and server code (they use the
`NEXT_PUBLIC_` prefix and are intentionally public — the publishable key
is designed to be shipped to the browser and is meaningless without RLS,
which is what actually protects the data):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

**Never introduce `SUPABASE_SERVICE_ROLE_KEY` (or any other secret key)
into client-accessible code.** Nothing in this milestone needs it — the
profile-creation trigger runs inside Postgres (see `database.md`), not
through a service-role client call, precisely so a service-role key never
has to exist in application code. If a future milestone needs
elevated/admin database access, that key must only ever be read in a
server-only context (Route Handler / Server Action) and must never be
prefixed `NEXT_PUBLIC_`.

`.env.local` is gitignored (see `.gitignore`); it currently holds
placeholder values (`your-project-url`, `your-anon-key`) and must be
filled in with a real project's credentials before auth will function —
see `database.md` and `testing.md`.

## Error handling

Raw Supabase/Postgres error text is never shown to the user.
`src/lib/validation/auth.ts`'s `mapAuthError()` matches known error
substrings to plain-language copy ("Incorrect email or password.", "An
account with this email already exists.", etc.) and falls back to a
generic "Something went wrong" message for anything unrecognized,
logging the original message server-side via `console.error` for
debugging.

## Supply-chain note (informational, not a vulnerability)

While testing locally, loading `.env.local` printed a "tip" banner
mentioning `www.vestauth.com`. This comes from `dotenv`'s own built-in
`TIPS` array (`node_modules/dotenv/lib/main.js`), a real but
easy-to-mistake-for-suspicious in-console ad for another product by the
same maintainers (`dotenvx`/`vestauth`). It's not code executed against
this project, not something this milestone's code triggers directly, and
not a compromised package — just worth knowing about if you see it in
your own terminal.

---

# Security — Milestone 2 additions

## RLS on `student_interests`, `student_goals`, `student_opportunity_preferences`

Same pattern as `profiles`: RLS enabled, every policy scoped to
`auth.uid() = profile_id`, so a student can only ever see or change their
own selections. `select`, `insert`, and `delete` policies exist; there is no
`update` policy since the app only ever deletes-and-reinserts a student's
rows (see `database.md`), never updates one in place.

## `complete_onboarding()` never trusts client-supplied identity

The RPC takes no student/profile id argument — it always resolves the
current student via `auth.uid()` inside the function body, and raises if
`auth.uid()` is null. Combined with `security invoker` (it runs as the
calling student, not an elevated role), this means the function grants no
capability a client didn't already have via direct table access under RLS —
its only job is making four operations atomic, not bypassing access
control. `EXECUTE` on the function is also explicitly restricted to the
`authenticated` role (revoked from `public`) as defense-in-depth.

## Server-side re-validation on every save

The onboarding wizard validates each step client-side with Zod before
letting the student continue, purely for UX (immediate feedback, no round
trip). None of that is trusted: `submitOnboarding` (the Server Action)
re-validates the entire payload against the same Zod rules
(`onboardingSchema` in `src/lib/onboarding/schema.ts`) before it ever calls
the database, exactly per the "never trust a Server Action's input just
because the form that calls it is gated behind a logged-in page" guidance —
Server Actions are POST endpoints reachable by anyone who can craft the same
request, not just the wizard's own UI.

## No service-role key introduced

Nothing in this milestone reads or needs `SUPABASE_SERVICE_ROLE_KEY`. The
`complete_onboarding` RPC runs with the calling student's own privileges
(see above), so the same rule from Milestone 1 still holds: no
service-role key exists anywhere in application code.

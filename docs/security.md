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

---

# Security — Milestone 4 additions

## `opportunities` has no client-facing write path

Only a `select` policy exists (scoped to `is_active = true`); there is no
insert/update/delete policy for `authenticated` or any other client-facing
role. Writes only ever happen through `scripts/import-opportunities.ts`,
run manually by a developer/admin using the service-role key, which
bypasses RLS entirely — this is the "admin-safe import path" the spec
asked for, and it is never called from a Server Action, Route Handler, or
anything else reachable by a browser.

## `SUPABASE_SERVICE_ROLE_KEY` is the first service-role key this codebase reads

It is read in exactly one place: `scripts/import-opportunities.ts`, a
standalone Node script, never imported by any file under `src/`. It is not
prefixed `NEXT_PUBLIC_`, so Next.js never inlines it into browser-bundled
code. `.env.local` (gitignored) now documents the variable name with a
placeholder value; it must be filled in with the project's real
service-role/secret key only when actually running the import script.

## `saveOpportunity`/`unsaveOpportunity` never trust a client-supplied user id

Both Server Actions (`src/lib/opportunities/save-actions.ts`) resolve the
acting user via `getAuthenticatedUser()` — never a parameter the client
could tamper with — and the dependency-free logic they delegate to
(`src/lib/opportunities/save.ts`) doesn't even accept a `userId` from
outside; its whole signature is built around "the caller already resolved
one, or there isn't one." RLS on `saved_opportunities`
(`auth.uid() = user_id`) is the actual enforcement; the action-level check
just turns an unauthenticated call into a plain message instead of a raw
RLS rejection. `tests/opportunities/save.test.ts` asserts the write
function is never even called when there's no session.

## Search input is sanitized before being embedded in a Postgrest filter string

`listOpportunities` (`src/lib/opportunities/query.ts`) builds its search
clause with Postgrest's `.or()`, which takes a raw string using `,` to
separate conditions and `()` for grouping. A search term containing those
characters could otherwise alter the filter's structure, not just its
value (not classic SQL injection — Postgrest still parameterizes the
actual comparison — but it could still make the filter behave unexpectedly
or throw). `sanitizeSearchTerm` strips `,`, `(`, and `)` out of the term
before it's embedded, and the value is additionally wrapped in double
quotes per Postgrest's own escaping convention.

---

# Security — Milestone 5 additions

## Five new tables, zero client-facing policies

`opportunity_sources`, `opportunity_ingestion_runs`,
`raw_opportunity_records`, `opportunity_source_links`, and
`opportunity_review_queue` all have RLS enabled with no `select`/`insert`/
`update`/`delete` policy for any client-facing role — not even a
read-only one for `authenticated`. The only access path is a service-role
connection, which bypasses RLS entirely. This is intentional and stricter
than `opportunities` itself: raw/source/review data should never reach a
browser, per the spec ("Raw records should never be shown directly to
students" / admin review needs no public dashboard).
`tests/opportunities/intelligence-migration.test.ts` asserts this
statically for all five tables.

## `residency_requirements`/`citizenship_requirements` reuse the existing `opportunities` RLS, not a new policy

These are plain columns on `opportunities`, covered by the same
single `select … using (is_active = true)` policy from Milestone 4 — no
new policy was needed or added. What changed is application-level: a
confirmed citizenship requirement is hidden from default search results
(`query.ts`) and, when shown, is always capped at an `unclear` eligibility
label (`eligibility-engine.ts`) rather than presented as a confirmed
"eligible", since `profiles` has no citizenship/visa-status field to
verify it against.

## No new service-role key or network call was introduced

The three discovery adapters built this milestone
(`src/lib/opportunities/adapters/`) never make an HTTP request: the
manual-JSON and CSV adapters only read a local file via `node:fs`, and the
static adapter is a fixed in-memory list. None of them, nor any of the new
`src/lib/opportunities/*.ts` engines, read `SUPABASE_SERVICE_ROLE_KEY` —
the only place that key is read remains `scripts/import-opportunities.ts`,
unchanged from Milestone 4. A future real RSS/API adapter or ingestion
job that does make outbound requests or write via service-role should
follow that same script's pattern: server-only, never imported by
anything under `src/app/`, never prefixed `NEXT_PUBLIC_`.

---

# Security — Milestone 6 additions

## SSRF protections on every outbound ingestion fetch

`src/lib/opportunities/url-safety.ts`'s `checkUrl()` is the single choke
point every real network fetch in the ingestion path goes through
(adapters, and the runner's application-link check):

- **Protocol allowlist**: only `http:`/`https:`; anything else (including
  `file:`, `javascript:`, `data:`) is blocked before any request is made.
- **Private/loopback/link-local rejection**: literal IPv4/IPv6 addresses
  in RFC1918, loopback, and link-local ranges (including the
  `169.254.169.254` cloud-metadata address) are blocked without a
  request. Hostnames are also resolved via `node:dns` and the *resolved*
  address is checked the same way, defending against DNS rebinding (a
  hostname that looks public but resolves internally).
- **Every redirect hop is re-validated**, not just the original URL — a
  safe starting URL redirecting to an internal address is blocked at the
  hop where that happens, up to a fixed maximum (3) redirects; it never
  follows an unbounded chain.
- **Bounded timeout** via `AbortController` (default 8s) on every attempt.
- **Identifying `User-Agent`** (`AvelaOpportunityBot/1.0 (+...)`) so any
  source operator can identify and, if they choose, block this traffic —
  never disguised as a browser.
- **At most one conservative retry** (`http-fetch.ts`), only for
  transient outcomes (network error/timeout, 5xx) — never for a clean 4xx
  or a blocked/private-network result, and never more than twice total per
  URL per call.

This module is never used to fetch a URL a student supplies — only source
pages/links discovered during ingestion, run from the admin-only CLI
script (see below), consistent with "Do not fetch arbitrary URLs supplied
by students."

## The ingestion CLI follows the exact `import-opportunities.ts` pattern

`scripts/ingest-opportunities.ts` reads `SUPABASE_SERVICE_ROLE_KEY` from
`.env.local`, is never imported by anything under `src/app/`, and is only
ever run manually from a developer/admin machine or CI — the same
"admin-safe" shape Milestone 4 established. No new Route Handler or
Server Action exposes ingestion to a browser-reachable path. The service-
role key's value is never printed or logged — the script's own error
messages describe *which* env var is missing, never its value, and none
of the observability logging described below includes it.

## Observability logging never includes secrets, tokens, or full page bodies

`ingestion-runner.ts`'s logger only ever receives short, structured
strings (`source fetched`, `records found=N`, counts) that this code
itself constructs — the service-role key and any auth token never flow
into the runner at all (only the repository, built once in the CLI script
with the real client already attached, does), so there is nothing for the
logger to accidentally leak. Raw HTML page bodies are never logged, in
debug mode or otherwise — the only per-record detail the CLI's `--dry-run`
output prints is title, source URL, action, and rejection/queue reasons.

## Extraction confidence is never silently upgraded

Every value `extraction.ts`'s extractors produce carries its own
`confidence` (0-100) and `evidence`. Nothing in this milestone writes an
extracted field to `opportunities.verification_status = 'verified'`
automatically — `isLowConfidence()` exists specifically so a future
ingestion job can gate on it, and `review-queue.ts`'s
`low_confidence_grade` reason exists to route low-confidence values to a
human rather than let them become a "verified" fact by default.

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

---

# Security — Fresh Discovery ("Find more opportunities") additions

## `SUPABASE_SERVICE_ROLE_KEY` is now read at runtime, not just by the import script

Milestone 5's "no new service-role key or network call was introduced"
claim above no longer holds for the app as a whole — it was true only for
that milestone's own (file/static) adapters. This milestone's
`src/lib/opportunities/discovery-repository.ts` reads
`SUPABASE_SERVICE_ROLE_KEY`/`NEXT_PUBLIC_SUPABASE_URL` from a Server
Action (`findMoreAction`, `src/lib/opportunities/discovery-actions.ts`),
because `opportunities`/`opportunity_sources` still have no client-facing
insert policy (unchanged from Milestone 4/5) and a fresh discovery run
needs to write newly-ingested opportunities the same way
`scripts/ingest-opportunities.ts` does. **Every environment that runs this
app — including production — must have `SUPABASE_SERVICE_ROLE_KEY` set**,
not only a developer machine running the import script. A missing key
here was the root cause of a real "Find more opportunities" outage: see
`docs/decision-log.md`.

The identity/authorization boundary is unchanged: `findMoreAction` still
resolves the acting student from the session only, still never accepts a
client-supplied user id, and the service-role client is only ever used to
write to the shared, RLS-locked-down catalog tables — never to read or
write anything scoped to a specific user. `getDiscoveryRepository()` is
also lazy (constructed only if a fresh-discovery run is actually reached,
never for a request the existing catalog already satisfies), so a broken
or missing key degrades that one run to an honest "couldn't search new
sources" outcome rather than failing every "Find more" click outright.

---

# Security — Milestone 10 additions (Student Portfolio & Evidence Vault)

## The `student-portfolio` Storage bucket is private, with no public URL ever generated

`storage.buckets.public = false` (see `database.md`). The only way to read
a file's bytes is `createPortfolioFileSignedUrl()`
(`src/lib/portfolio/repository.ts`), called only from
`getPortfolioFileDownloadUrl` (`src/lib/portfolio/actions.ts`) after that
Server Action has already resolved the file row through
`getPortfolioFile(supabase, user.id, fileId)` — i.e. only after confirming
the row belongs to the requesting session. The resulting signed URL
expires after `PORTFOLIO_SIGNED_URL_EXPIRY_SECONDS` (5 minutes) and is
never persisted anywhere — it's generated fresh on every "View" click, not
baked into a page render, so a stale copy of a page can never leak a
working link.

## No user can read another user's files — storage-layer and app-layer, independently

Two independent layers both have to agree before a file is ever readable:

- **Storage RLS** (see `database.md`): every `storage.objects` policy on
  the bucket reduces to `(storage.foldername(name))[1] = auth.uid()::text`.
  Even a hypothetical bug in application code that requested the wrong
  path would still be rejected by Postgres itself.
- **The `portfolio_files` table's own RLS** (`auth.uid() = user_id`,
  same pattern every owner-scoped table in this codebase uses) gates
  whether a file's *row* — and therefore its `storage_path` — is even
  visible to look up in the first place.

`tests/portfolio/migration.test.ts` asserts both statically.

## No path traversal — the storage path is never built from client input

`buildPortfolioStoragePath()` (`src/lib/portfolio/storage.ts`) is the only
function that ever constructs a `storage_path`, and it takes a
server-resolved `userId` (from the authenticated session) and a
server-resolved `portfolioItemId` (a real database row id, or `null`) —
never anything typed by the student. The original filename a student
picked is sanitized (`sanitizeOriginalFilename`: path separators and
control characters stripped) but is *never* used to build the actual
storage path — only a server-generated random id is, which is what
closes off path traversal via a crafted filename like `../../etc/passwd`
entirely, rather than relying on the sanitizer to catch every case.
`tests/portfolio/storage.test.ts` covers this directly.

## No arbitrary MIME type is ever trusted

Every upload path — the Route Handler
(`src/app/api/portfolio/files/route.ts`) — validates the browser-reported
`file.type` against a fixed four-value allowlist
(`validatePortfolioFileType`, `src/lib/portfolio/storage.ts`) before doing
anything else with the file, and the `portfolio_files.mime_type` column
has the same allowlist as a check constraint (defense-in-depth, in case
any future write path skips the app-level check). Nothing executable
(`.exe`, `.sh`, `.js`, etc.) is in the allowlist; a browser's mismatched
or spoofed `Content-Type` for a disallowed extension is rejected the same
way any other disallowed type is — the check is purely on the allowlisted
value, never a trust-on-claim.

## The server validates file size and type — never only the client

The file `<input accept="...">` attribute and the client-side check in
`file-upload-form.tsx` are UX only, exactly like every other client-side
validation in this codebase. The authoritative checks
(`validatePortfolioFileType`/`validatePortfolioFileSize`) run again inside
the Route Handler, server-side, before the file ever reaches Supabase
Storage — a request built by hand (skipping the form entirely) is
validated identically.

## Upload progress required a Route Handler, not a Server Action — documented, not smuggled in

Every other mutation in this milestone is a plain `"use server"` action,
consistent with the rest of the codebase. File upload is the one
exception: real byte-level progress requires
`XMLHttpRequest.upload.onprogress`, which only works against a normal
HTTP endpoint, not a Server Action's RPC-style call. The Route Handler
(`src/app/api/portfolio/files/route.ts`) follows the exact same identity
rule as every Server Action here — `getAuthenticatedUser()` first, a
401 if there's no session, every write scoped to that user's id — so this
is a transport-layer difference only, not a weaker-auth code path.

## No user can read another user's `portfolio_items`/`application_evidence_links`

Same owner-only RLS pattern as every table in this codebase
(`auth.uid() = user_id`). `application_evidence_links`' insert policy
additionally reverifies both foreign references — the `application_plans`
row and the `portfolio_items` row — belong to the same student before the
insert is allowed, mirroring `application_tasks`' insert policy from
Milestone 8. The Server Action layer (`attachEvidence` in
`src/lib/portfolio/actions.ts`) reverifies the same two things itself,
before ever calling the database, as defense-in-depth on top of RLS —
never trusting that a client-supplied `applicationPlanId`/`portfolioItemId`
pair actually belongs to the caller.

## Deleting an item cleans up its files safely, in the right order

`deletePortfolioItem` (`src/lib/portfolio/actions.ts`) removes the
item's Storage objects *before* deleting the `portfolio_items` row. If
the Storage removal fails, the DB delete is still attempted only after
that point — but if it's the DB delete itself that fails, nothing is
lost the student can't still see, since the item and its files remain
exactly as they were (no partial, invisible state). This is necessary
specifically because a Postgres `on delete cascade` (which safely cleans
up the `portfolio_files` *rows*) has no reach into Supabase Storage —
an orphaned Storage object with no owner-scoped row pointing at it would
otherwise be unreachable and un-deletable through the app ever again.

## No service-role key was introduced

Every Supabase call in this milestone — Server Actions, the Route
Handler, and every read on the Portfolio Center / item workspace / evidence
pages — uses the ordinary server client built from the visitor's own
session cookies (`src/lib/supabase/server.ts`), the same client every
other milestone since Milestone 1 uses. `SUPABASE_SERVICE_ROLE_KEY`
remains read in exactly the one place it always has been:
`scripts/import-opportunities.ts`, unrelated to this milestone. Storage
RLS (not a service-role bypass) is what makes upload/download/delete work
under the student's own privileges.

---

# Security — Milestone 10.7 additions (Identity, Claim Integrity, Universal Project Verification, Anti-Gaming Hardening)

## Threat model

One successful check must never verify an entire portfolio entry. Every
row below separates what a signal actually proves from what it doesn't,
so no single control (an inbox click, a repo match, an uploaded photo) is
ever allowed to read as "this whole entry is true." Language throughout
this milestone — code comments, event `reason` strings, reviewer-facing
copy, student-facing copy — stays neutral: `containsForbiddenLanguage()`
(`src/lib/verification/messages.ts`) is reused everywhere a free-text
reason is written, and this milestone extends `FORBIDDEN_WORDS` rather
than introducing a second list. No automated signal in this milestone
ever sets `rejected`, blocks portfolio creation, blocks an application, or
decides admissions/eligibility — every detection path here only ever
raises a risk level or routes to a human reviewer queue.

### Identity & GitHub

| Abuse case | Avela can check | Avela cannot know | Prevention | Detection | Student-facing result | Human review |
|---|---|---|---|---|---|---|
| Claiming another person's GitHub repo | Repo ownership/contributor/commit-author status via GitHub REST | Whether the "student" behind a connected account is really them | OAuth-based `connected_identities` ties ownership credit to a signed-in GitHub session, not a typed string (Phase 2) | Typed `github_username` never earns identity credit, only a search hint | "Connect your GitHub account to confirm control." | No — structural prevention, not a judgment call |
| Entering another person's GitHub username | Exact-login match against connector calls | Whether the typer controls that account | Same as above — manual entry is permanently capped below `strongly_supported` for identity | n/a (prevented, not detected) | Same as above | No |
| Claiming a fork as original work | Parent-repo relationship via GitHub API | Whether fork commits are meaningfully original | Fork vs. parent is always shown separately; only the student's own commits/diffs count toward authorship | Large parent-history overlap with near-zero student-authored diff | "Authorship: not independently confirmed for forked history." | No — scoring cap, not an accusation |
| One tiny commit, claiming full authorship | Commit count/lines authored by the connected identity | True effort/ownership | `authorship_or_contribution` dimension scores from actual contribution volume, never presence alone | Contribution share far below claimed role (e.g. "sole creator") | "Role as sole creator: not independently confirmed." | Optional — flagged for `additional_evidence_recommended` |
| Org-owned work claimed as personal project | Repo/org ownership via API, org's public member list | Private org membership or internal authorization | `organization_relationship` dimension is separate from `project_or_activity_exists`; org-owned repos never inherit personal-project trust | Org-owned repo + `project_context = personal_project` | "This looks like it may belong to an organization — you can add that context." | Optional |

### Exaggeration & role/date/impact claims

| Abuse case | Avela can check | Avela cannot know | Prevention | Detection | Student-facing result | Human review |
|---|---|---|---|---|---|---|
| Exaggerating role, dates, hours, users, revenue, impact, awards | Consistency with evidence/verifier-confirmed fields | The true numbers, ever, from public sources alone | `impact_or_outcome` and `dates_and_duration` are dimensions independent of `project_or_activity_exists`; nothing here ever confirms a number Avela didn't independently observe | Verifier-confirmed scope narrower than displayed claim (Phase 6) | "Some details were not independently confirmed." | Optional |
| Fake organization / recently registered domain | RDAP registration context (existing `rdap.ts`), MX/SPF/DMARC presence | Whether an organization is legitimate — domain age is context, not proof | Domain checks are supporting evidence only, never gate submission | New-domain-used-immediately pattern (Phase 6) | "We could not confirm this organization's domain — you can still continue." | Yes — `manual_review_required` |
| Lookalike domains / misleading redirects | Domain string compared to a curated/official domain; redirect chain (reusing `url-safety.ts`'s SSRF-safe fetch, capped hops) | Intent | `verifier-legitimacy.ts` never trusts a domain string alone — always resolves MX and compares registrable domain, not substring match | Domain mismatch classification | "This email does not match the organization's website. You may still continue." | Optional |
| Same-name credential/award confusion | Issuer/org name string only | Whether two same-named issuers are the same entity | `award_or_credential` dimension never auto-upgrades from name match alone | Name match with no other corroborating field | "We could not confirm which organization issued this." | Optional |

### Verifier legitimacy & collusion

| Abuse case | Avela can check | Avela cannot know | Prevention | Detection | Student-facing result | Human review |
|---|---|---|---|---|---|---|
| Friend/relative as verifier | Nothing directly — no relationship graph exists or is built | Real-world relationships (explicitly out of scope — no relatives/social-graph lookups) | Verifier must state "relationship to student" and which fields they can confirm; this is disclosed context, not proof | Same verifier reused across unrelated students (below) | n/a directly; surfaces via reuse pattern | Optional |
| Student's own second email as verifier | Verifier email vs. student's account email (exact + light normalization) | A truly different but student-controlled inbox | Hard block: verifier email cannot equal the student's own account email | n/a (blocked at request time) | "A verifier must be someone other than you." | No |
| Free/disposable email verifier | MX record presence, known free-webmail list, known disposable-domain list | Whether the person is legitimate — free email is common and often legitimate (teachers, coaches) | Classified, never blocked: `personal_or_free_email`/`suspicious_or_disposable` | Disposable domain match, missing MX | "This confirms participation, but not organizational authority." | Disposable → yes; free webmail → no |
| Several verifier identities created (by the student) | Cannot detect directly (would require cross-account correlation Avela doesn't build) | Whether two verifier emails are "the same person" | Rate limits on requests/resends per item | Unusually high distinct-verifier count in a short window (Phase 6 velocity signal) | n/a directly | Optional |
| One verifier repeatedly confirming unrelated students | Verifier email appears across multiple students' `portfolio_verifications` rows | Whether reuse is legitimate (a real coach/teacher verifies many students) or manufactured | None — by design, legitimate repeat verifiers exist (a teacher) | `repeated_verifier_pattern` signal counts distinct students per verifier email in a rolling window | Not shown to the student at all — reviewer-only signal | Yes |
| Manufacturing confirmations via multiple student accounts (circular verification) | Verifier email == another student's own account email | Coordinated intent | Same self-verification block applied bidirectionally | Circular pair detector (Phase 6): A verifies for B, B verifies for A | n/a directly; reviewer-only | Yes |

### Evidence & content integrity

| Abuse case | Avela can check | Avela cannot know | Prevention | Detection | Student-facing result | Human review |
|---|---|---|---|---|---|---|
| Reusing the same document/image/certificate/URL across claims | Existing `findDuplicateEvidenceUsage` (file id / URL exact match); extended to cross-claim image hash | Whether reuse is legitimate (the same certificate genuinely applies to two entries) | No blocking — reused evidence gives no *additional* profile-strength credit (Phase 8) | Exact hash + perceptual-hash match across unrelated items (Phase 4/6) | "This evidence may also appear on another entry." | Optional |
| Copying project photographs from the internet | Perceptual/duplicate hash only — no reverse-image API key exists in this environment | Whether an image was copied — similarity is not proof | `VisualSimilarityProvider` interface ships with a no-op default; a real provider is opt-in, never required | Optional visual-similarity provider (unconfigured by default) | "This evidence may also appear elsewhere — you can still keep it." | Optional, never automatic |
| AI-generated images/documents | Nothing reliable — Avela does not implement AI-content detection | Whether content is AI-generated — no reliable signal exists | AI-detection is explicitly never implemented as a trust signal | n/a | n/a | Never auto-flagged on this basis |

### Post-verification integrity

| Abuse case | Avela can check | Avela cannot know | Prevention | Detection | Student-facing result | Human review |
|---|---|---|---|---|---|---|
| Editing a claim after verification | Field-level diff against the last material-hash snapshot (Phase 5) | Intent behind the edit | Material changes automatically stale/downgrade only the *affected* dimensions, never silently keep old trust | `material-hash.ts` diff on every save | "Some details changed after verification — the affected parts need a fresh check." | No — automatic, explainable |
| Replacing evidence after verification | Evidence-file/URL id change on the verification row | Intent | Evidence replacement always re-triggers evaluation of dependent dimensions | Existing `evidence_replaced` event type, now wired to invalidation | Same as above | No |
| Deleting conflicting evidence while keeping a badge | Evidence delete event vs. existing verified dimensions | Intent | Deleting evidence downgrades any dimension that depended on it; audit history (`portfolio_verification_events`/`claim_dimension_events`) is append-only and immutable regardless of what's deleted | Dependency map lookup on delete (Phase 5) | "This entry's support level was updated after evidence was removed." | No |
| Repeatedly sending verification requests until someone confirms | Resend/request counters (existing 24h cooldown + 3 resend cap) | Intent | Existing cap stays; Phase 6 adds a DB-backed limiter for new request types (connect attempts, challenges) so the same pattern can't route around the in-memory limiter via a new endpoint | Request velocity signal | "You've reached the limit for this request type — try again later." | No — rate limit, not a judgment |

### Anti-gaming / volume farming

| Abuse case | Avela can check | Avela cannot know | Prevention | Detection | Student-facing result | Human review |
|---|---|---|---|---|---|---|
| Splitting one project into many entries to farm points | Title/description/date-range similarity across a student's own items (`textSimilarity`, reused from `osint/matching.ts`) | Whether split entries are genuinely distinct efforts | Near-duplicate clustering in `strength.ts` counts one representative per cluster for VOLUME/COVERAGE/COMPLETENESS — items stay visible and editable, just not double-counted (Phase 8) | Same clustering, surfaced as a soft signal | "This may be part of a larger project you've already added." | Optional |
| Creating many nearly identical verified entries | Same clustering + duplicate evidence hash across items | Same as above | Same as above | Same as above | Same as above | Optional |
| Reviewer misuse | Reviewer acting on their own claim; reviewer decision without a reason | Reviewer intent | Conflict-of-interest guard blocks a reviewer from deciding their own claim (Phase 7); reason is required and stored immutably | Guard check at decision time | n/a (reviewer-facing) | N/A — structural block |
| Exposed verification links or tokens | Token possession alone | Whether the presenter is the intended verifier | Tokens are single-purpose, hash-only stored (existing `tokens.ts` pattern reused for every new token type — OAuth state, possession challenges), short expiry, one active token per request | Constant-time hash compare; expired/revoked tokens fail closed | "This link is no longer valid." | No |
| Duplicate rows from race conditions | Unique constraints (`portfolio_verifications_one_per_item`, and the new `connected_identities` unique-active-index) | n/a | Select-then-insert-with-unique-constraint-backstop pattern, cloned from `ensureVerificationRow` (`verification/repository.ts:44-62`), reused for every new "ensure one row" path | `23505` conflict handling, re-select-on-race | n/a (invisible to the student) | No |

## Data classifications introduced this milestone

- **Reviewer-only, never shown to the subject student**: `integrity_signals`, `integrity_reviews` — these exist to route human review, not to accuse a student, and showing "you have been flagged" to the person being evaluated would itself be the harm the spec asks to avoid.
- **Never collected, anywhere, by design**: facial recognition, home address, phone number, relatives, private/login-gated social media, school schedules, leaked databases, people-search results. No connector or provider added this milestone reads any of these.
- **Minors**: every new student-facing prompt (personal-project narrative, possession-challenge photo) explicitly never requires a face or location; EXIF is stripped before any image is retained past the possession check.

---

# Security — Milestone 10.8 additions (Universal Portfolio Coverage, Multi-Provider Identity, Low-Friction Verification, Autonomous Testing)

## Threat model

Same neutral-language, no-single-signal-proves-everything posture as Milestone 10.7, extended to a ~110-category taxonomy and a ~130-provider registry instead of GitHub alone. Two structural rules apply everywhere in this milestone: (1) no category or provider is ever hard-coded to require an organization, evidence, or a connected account — every requirement flows through `project-context.ts`'s visibility rules, which a category can only ever tighten never loosen; (2) no provider is ever shown as "Connect"-able unless the registry (`provider-registry-data.ts`) honestly marks it `oauth`/`proof_of_control` *and* `isProviderAvailable()` confirms it's actually configured.

### Taxonomy, context, and template spoofing

| Abuse case | Avela can check | Avela cannot know | Prevention | Detection | Student-facing result | Human review |
|---|---|---|---|---|---|---|
| Submitting an invalid or made-up `activity_category_key` | Length bound only (DB `check`); resolution always goes through `resolveCategory()` | Whether a category is "real" in some absolute sense — the taxonomy is deliberately open-ended | Unknown keys resolve to `GENERIC_CATEGORY_FALLBACK` and its generic template — never rejected, never a blocking error | n/a — by design, this is a supported path (future categories) | No difference in experience; the item saves normally with generic prompts | No |
| Choosing a low-scrutiny category/context to avoid an org requirement for org-affiliated work | Nothing — Avela cannot verify where an activity "really" happened | Ground truth about the activity | `orgRequired` only ever gates a *field being shown as required*, never blocks saving either way, so there is no incentive structure to game — misclassifying doesn't unlock a score or verification advantage `strength.ts` doesn't already grant identically | n/a — no automated detection; not a scoring exploit because category/context never feed `strength.ts` | n/a | n/a |
| Cross-category fairness gaming (choosing whichever category "counts more") | `itemTypeBucket` mapping is fixed per category, not student-chosen | n/a | Every category maps to one of the 14 existing `item_type` buckets, all of which `strength.ts` has always scored identically (`strength-fairness.test.ts`); there is no higher- or lower-value category to pick | n/a | n/a | n/a |

### Generic public-profile control challenge (TIER 2, any provider)

| Abuse case | Avela can check | Avela cannot know | Prevention | Detection | Student-facing result | Human review |
|---|---|---|---|---|---|---|
| Pointing the challenge at an internal/private network address | Resolved IP via `resolvesToPrivateAddress()` (reused from `url-safety.ts`) | n/a | `generic-profile-challenge.ts` routes every target URL through `safeFetch`'s existing SSRF layer, plus its own HTTPS-only pre-check (stricter than `safeFetch`'s general http-or-https allowance) | Blocked at fetch time (`blocked_private_address`) | "We couldn't confirm that yet. You can still add evidence instead." | No |
| Claiming an unimplemented/unverified provider as connectable | Registry tier + `isProviderAvailable()` | n/a | `validateProviderForGenericChallenge()` rejects any provider whose tier isn't `proof_of_control`, before a challenge is ever created — GitHub (`oauth`), public-link-only, and unsupported providers can never reach this flow | n/a — rejected at request time | "That provider isn't available yet. You can add a public link instead." | No |
| Reusing an old/expired challenge code found elsewhere | Hash-only comparison + expiry timestamp | n/a | Same `generatePossessionChallenge`/`verifyPossessionChallenge` hash-and-expire logic already proven in Milestone 10.7 — reused verbatim, not reimplemented | `expired`/`token_mismatch` classified results | "We couldn't confirm that yet." | No |
| A page happening to contain the exact challenge string by coincidence | Nothing beyond string presence — same limitation the GitHub fallback already has | Genuine authorship or control, ever, from a string match alone | Confirms *control of the page at that moment* only — never authorship, never impact; documented explicitly in the table's `comment on table` and in `generic-profile-challenge.ts`'s own header comment | n/a | The confirmed dimension is `account_or_asset_control` only, never `authorship_or_contribution` | n/a |

### Provider-registry honesty

| Abuse case | Avela can check | Avela cannot know | Prevention | Detection | Student-facing result | Human review |
|---|---|---|---|---|---|---|
| Registry claims OAuth support for a provider with no real integration | Code review / `provider-registry.test.ts`'s "only GitHub is tier oauth" assertion | n/a | Structural: `oauthProvider()` is only ever called once, for GitHub, in `provider-registry-data.ts`; every other of the ~130 entries uses `challengeProvider`/`linkOnlyProvider`/`unsupportedProvider`, which never claim `oauthSupport: true` | Test fails if a future edit adds a second `oauthProvider()` call without also shipping the real OAuth flow | A student is never shown a "Connect" button that can't actually complete | No — caught in CI/tests before it ships |
| An OAuth-tier provider shown as connectable while unconfigured | `isProviderAvailable()` checks every required env var is actually set | n/a | Fails closed exactly like `isGithubOauthConfigured()` — GitHub's own required-env-var list lives on its registry entry, checked generically | n/a — prevented, not detected | "That provider isn't available yet. You can add a public link instead." | No |

### Team-project authorship

| Abuse case | Avela can check | Avela cannot know | Prevention | Detection | Student-facing result | Human review |
|---|---|---|---|---|---|---|
| Implying sole authorship of a team project by leaving `personal_contribution` blank | Presence/absence of the field only | True division of labor | `team_output` and `personal_contribution` are separate columns and separate UI fields everywhere — never merged, never inferred from each other; `hasDistinctPersonalContribution()` is a display hint only, never a score input | n/a — `strength.ts` reads neither field, so there is no score to game | n/a | n/a |
| Listing collaborators without their knowledge to pad legitimacy | Nothing — no verification of a collaborator's own account exists (email is optional, per spec, precisely so this data is never treated as authoritative) | Whether a listed collaborator actually agreed | Collaborator rows are private (owner-only RLS `select`), never publicly exposed, never contribute to profile-strength scoring, and email is explicitly optional so the feature can't be mistaken for a verification mechanism | n/a | n/a | n/a |

### E2E test-account isolation

| Abuse case | Avela can check | Avela cannot know | Prevention | Detection | Result | Human review |
|---|---|---|---|---|---|---|
| E2E seed/cleanup scripts accidentally running against the production Supabase project | `E2E_SUPABASE_URL` vs. `NEXT_PUBLIC_SUPABASE_URL` string comparison, normalized (case/trailing-slash insensitive) | n/a | `requireIsolatedE2eBackend()` throws before any client is constructed if the two URLs match, or if any of `E2E_SUPABASE_URL`/`E2E_SUPABASE_ANON_KEY`/`E2E_SUPABASE_SERVICE_ROLE_KEY` is unset — there is no fallback path to the app's production env vars anywhere in `src/lib/e2e/*` | `config.test.ts`'s "never falls back to production" suite | Script exits with a clear error, writes nothing | No — structural, not a runtime judgment call |
| A cleanup sweep deleting a real (non-E2E) account | `user_metadata.e2e_test === true` AND email ends in `@e2e.avela.invalid` — both required | n/a | `isGenuineE2eUser()`/`deleteSingleE2eUser()` both re-verify server-side; a single matching marker is never enough (tested explicitly against a user with only one of the two) | `cleanup.test.ts`'s spoofed-single-marker cases | Real accounts are never candidates, dry-run or real | No |
| A parallel Playwright test's teardown deleting another concurrently-running test's persona | Per-test teardown targets one `userId` only | n/a | `deleteSingleE2eUser()` (not the global `cleanupE2ePersonas()` sweep) is what the Playwright fixture's teardown calls — the global sweep is reserved for an explicit, separate `npm run e2e:cleanup` pass | n/a | n/a | n/a |
| Playwright driving a browser against the real production app | `NEXT_PUBLIC_APP_URL` (production) vs. the hardcoded local `baseURL` in `playwright.config.ts` | n/a | `playwright.config.ts` hardcodes `http://localhost:3100` and never reads `NEXT_PUBLIC_APP_URL`; the local dev server it spawns is handed the isolated E2E Supabase credentials via the `webServer.env` override, not inherited from the ambient shell environment | n/a | n/a | n/a |

## Data classifications introduced this milestone

- **Never falls back to production, structurally**: `src/lib/e2e/*` and `playwright.config.ts` only ever read `E2E_SUPABASE_URL`/`E2E_SUPABASE_ANON_KEY`/`E2E_SUPABASE_SERVICE_ROLE_KEY` — the app's normal `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are read only to *compare against* (reject a match), never to connect.
- **Owner-only, never public**: `portfolio_team_collaborators` (name/email/role), `portfolio_entry_narrative`, `portfolio_generic_profile_challenges` — same RLS posture as every other student-owned table introduced in prior milestones.
- **Never collected this milestone either**: no new provider integration reads followers, stars, views, likes, ratings, revenue, or GPS/workout data — `strava`/`chess_com`/etc. registry entries are explicitly scoped to profile-bio proof-of-control only, documented in their own limitations field.

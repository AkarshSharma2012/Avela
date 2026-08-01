# Subprocessor / Third-Party Service Inventory — Milestone 10.10B1

Audit-only, read-only. Built by grepping the whole `src/` tree (excluding
`node_modules`) for `fetch(`, `new URL(`, `axios`, `@vercel/`, `sentry`,
`posthog`, `analytics`, hardcoded external hostnames, and `.github.com`/
`githubusercontent`-style literals, then reading every module that matched
in full, and cross-referencing against `package.json`'s dependency list
(`@base-ui/react`, `@supabase/ssr`, `@supabase/supabase-js`,
`class-variance-authority`, `clsx`, `lucide-react`, `next`, `react`,
`react-dom`, `shadcn`, `tailwind-merge`, `tw-animate-css`, `zod` — no
analytics, error-monitoring, or AI SDK package present anywhere in
`dependencies`/`devDependencies`). Every outbound call found is a raw
`fetch()`/Node built-in — there is no HTTP client library, no vendor SDK.

No contract terms, DPAs, retention numbers, or data-residency facts are
invented below — every "unknown" is a genuine repo-visibility gap, not an
assumption.

## Enabled today (real outbound calls the app can make with zero extra configuration)

### Supabase (database, auth, storage)

- **What's sent**: essentially the entire product's data — every table in
  `docs/audit-10.10b1/data-inventory.md`, all portfolio file bytes (private
  `student-portfolio` bucket), the session/auth flow itself.
- **Purpose**: primary datastore, authentication, and file storage — this
  is the application's backend, not an optional add-on.
- **Enabled vs. planned**: **Enabled**, always-on, the app cannot function
  without it.
- **Credentials**: `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are intentionally public (the
  publishable key is meaningless without RLS, which is the actual
  protection — `docs/security.md`). `SUPABASE_SERVICE_ROLE_KEY` is
  server-only, confirmed never `NEXT_PUBLIC_`-prefixed anywhere (grepped
  every `NEXT_PUBLIC_*` reference in `src/` — only `NEXT_PUBLIC_SUPABASE_URL`/
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`/`NEXT_PUBLIC_APP_URL`/
  `NEXT_PUBLIC_SITE_URL` appear, none of them secret-shaped), read only in
  `scripts/import-opportunities.ts`, `scripts/ingest-opportunities.ts`, and
  the "Find more opportunities" Server Action per `docs/security.md`.
- **Data may leave the user's region**: unknown — not documented in repo
  (depends on which Supabase project region was provisioned; not visible
  from source).
- **Retention/deletion behavior**: unknown — not documented in repo beyond
  what this app itself does with the data (see `retention.md`). Supabase's
  own project-level backup retention is a dashboard/plan setting, not
  expressed in code (`retention.md`'s own conclusion, reused here).
- **Needs privacy-policy disclosure**: Yes — core infrastructure processor,
  should already be named.

### GitHub (OAuth identity connect + public REST API)

- **What's sent**: an OAuth authorization code (exchanged for an access
  token during connect), then read-only REST calls
  (`api.github.com/user`, `/user/repos`, `/repos/{owner}/{repo}`,
  `/repos/{owner}/{repo}/contributors`, `/repos/{owner}/{repo}/commits`,
  `/repos/{owner}/{repo}/readme`, `/orgs/{org}/public_members`,
  `/repos/{owner}/{repo}/issues/{n}`) using the student's own granted
  token or an optional server-side `GITHUB_TOKEN` for rate-limit headroom.
  No student PII beyond the GitHub account itself is sent — Avela does not
  transmit the student's name, email, grade, or portfolio content to
  GitHub.
- **Purpose**: (1) OAuth-based proof of GitHub account control for
  portfolio-item identity/ownership verification (`src/lib/identity/github-oauth.ts`);
  (2) public-repository OSINT evidence gathering — ownership, contributor,
  commit-author, README/date signals (`src/lib/osint/connectors/github.ts`,
  `src/lib/research/native-provider.ts`).
- **Enabled vs. planned**: **Code-complete but currently unconfigured** —
  `isGithubOauthConfigured()` requires `GITHUB_OAUTH_CLIENT_ID`,
  `GITHUB_OAUTH_CLIENT_SECRET`, and `GITHUB_OAUTH_REDIRECT_URI`, none of
  which are set in this environment (confirmed by the module's own header
  comment: "No real GitHub OAuth App exists in this environment"). The
  read-only public-API OSINT connector (`github.ts`) requires no
  credential at all and would run today for any student who links a
  `github.com/...` URL as evidence, independent of whether OAuth connect
  is configured — this part is effectively "enabled" already, just
  unauthenticated (subject to GitHub's public rate limit) unless
  `GITHUB_TOKEN` is also set.
- **Credentials**: `GITHUB_OAUTH_CLIENT_ID`/`GITHUB_OAUTH_CLIENT_SECRET`/
  `GITHUB_OAUTH_REDIRECT_URI` (OAuth app) and optional `GITHUB_TOKEN`
  (raises the unauthenticated API rate limit) — all read only in
  server-only modules (`src/lib/identity/github-oauth.ts`,
  `src/lib/osint/connectors/github.ts`, `src/lib/research/native-provider.ts`),
  never `NEXT_PUBLIC_`-prefixed, confirmed not present in the
  `NEXT_PUBLIC_*` grep above.
- **Data may leave the user's region**: unknown — not documented in repo
  (GitHub's own infrastructure/region is outside this codebase's control).
- **Retention/deletion behavior**: unknown for GitHub's side. On Avela's
  side: the OAuth access token is stored encrypted
  (`connected_identities.access_token_ciphertext`, AES-256-GCM, key
  `IDENTITY_TOKEN_ENCRYPTION_KEY`, server-only). Disconnecting sets
  `disconnected_at` (soft delete) — `user-rights-and-deletion.md` flags
  that Avela does not currently call GitHub's own token-revocation
  endpoint on disconnect, so a disconnected Avela identity may leave a
  still-valid grant in the student's GitHub "Authorized OAuth Apps"
  settings.
- **Needs privacy-policy disclosure**: Yes, once either the OAuth connect
  flow is configured (client ID/secret set) or the unauthenticated
  public-repo OSINT connector processes a real student's GitHub link in
  production — the latter can already happen with zero configuration.

## Code-complete but disabled by default (would need configuration to ever fire)

### NVIDIA (hosted Nemotron LLM — `src/lib/ai/evidence-grader/`)

- **What would be sent**: student evidence excerpts (up to 6 items, 1500
  characters each, truncated), item title/category/description, the
  student's claimed role/personal-contribution explanation, claimed
  dates/organization, and a summary of deterministic checks already run —
  to `https://integrate.api.nvidia.com/v1/chat/completions`. Text-only,
  per the module's own documentation (never images/audio/video).
- **Purpose**: AI-assisted grading of how well evidence supports a
  portfolio claim's dimensions (`EvidenceSupportGrader`, spec
  Parts 6/7/14) — output is capped, never allowed to set a dimension to
  `externally_confirmed`, and every caller must degrade gracefully to
  "AI unavailable."
- **Enabled vs. planned**: **Disabled by default, code-complete** — requires
  `AI_EVIDENCE_GRADER_PROVIDER=nvidia` and a non-empty `NVIDIA_API_KEY`;
  neither is set in this environment (confirmed by the provider module's
  own header: "NVIDIA_API_KEY was never configured here... this code path
  never executed"). No live invocation site was found in `src/app/` in
  this pass — the only reference outside the module itself is a type
  import in `src/lib/portfolio/capture/types.ts`. This is **not** the same
  as the older `extraction.ts` "unimplemented LLM-assisted interface
  placeholder" noted in `docs/database.md` (Milestone 5, opportunity-data
  extraction) — that one genuinely has no implementation behind it; this
  one is a real, working provider implementation that is merely
  unconfigured.
- **Credentials**: `NVIDIA_API_KEY` — read only in
  `src/lib/ai/evidence-grader/nvidia-provider.ts`/`config.ts`, both marked
  server-only in their own header comments, never returned to a caller,
  never logged. Not present in the `NEXT_PUBLIC_*` grep.
- **Data may leave the user's region**: unknown — not documented in repo.
- **Retention/deletion behavior**: unknown — not documented in repo. The
  module's own comment states it "never stores chain-of-thought (only the
  parsed final JSON ever leaves nvidia-provider.ts)," but says nothing
  about what NVIDIA itself retains of the request.
- **Needs privacy-policy disclosure**: **Not yet required today** (inert,
  unconfigured) but **must be added before `AI_EVIDENCE_GRADER_PROVIDER=nvidia`
  is ever set in any environment, including production** — this is the
  single most important finding of this report: a real, functioning
  third-party AI integration exists in the codebase, is not a placeholder,
  and was not previously documented anywhere in `docs/security.md` or
  `docs/database.md`.

## Referenced/considered but with no real implementation (heuristic fallback or pluggable interface only)

### URL reputation provider (`src/lib/osint/connectors/url-reputation.ts`)

- **What's sent**: nothing today — no live provider is wired up.
- **Purpose**: would flag suspicious/malicious claim URLs (e.g. a future
  Google Safe Browsing or commercial threat-intel integration).
- **Enabled vs. planned**: **Planned/scaffolded only** — the module ships a
  pattern-based heuristic fallback (raw-IP hostnames, punycode domains,
  deep subdomain chains, embedded credentials — all evaluated locally, no
  network call), plus a pluggable `UrlReputationProvider` interface a real
  vendor could implement later via a `URL_REPUTATION_PROVIDER` env var.
  No branch for any real vendor exists in `getUrlReputationProvider` today.
- **Credentials**: none configured; the module's own comment states a
  real provider's API key would be read from a server-only env var,
  following the same convention as `GITHUB_TOKEN`.
- **Data may leave the user's region / retention**: not applicable — no
  live provider exists to send data to.
- **Needs privacy-policy disclosure**: No, not until a real provider is
  wired up.

### Web search (`src/lib/research/native-provider.ts`'s `searchWeb`)

- **What's sent**: nothing — the function unconditionally returns
  `{ ok: false, reason: "Web search isn't available right now." }`. No
  search API (Google, Bing, or otherwise) is integrated.
- **Enabled vs. planned**: Not implemented at all, not even scaffolded
  behind a config flag the way the URL-reputation provider is.
- **Needs privacy-policy disclosure**: No.

## Keyless public-data lookups (no API key, no account, no contract — still real outbound network calls)

These are not "vendors" in the traditional subprocessor sense (no
credential, no account relationship, no data processing agreement is
possible with an anonymous public endpoint), but they are still real
third-party network destinations that receive a claim's public URL/domain
or a snippet derived from it, only ever in response to a student-initiated
OSINT/verification check (`portfolio_osint_checks.consent_scope` records
what was consented to). Listed for completeness since a privacy policy
should still be honest that "public source" checks leave the app.

| Service | Endpoint | What's sent | Purpose |
|---|---|---|---|
| RDAP (rdap.org bootstrap redirector → registry RDAP servers) | `https://rdap.org/domain/{domain}` | The registrable domain from a claim's linked URL, or a verifier's email domain | Domain-registration-age context only — hardcoded `authority_level: "unknown"`, never treated as proof (`src/lib/osint/connectors/rdap.ts`) |
| Crossref REST API | `api.crossref.org` (via DOI lookup) | A DOI extracted from a claim's URL | Scholarly-publication metadata verification, no key required |
| YouTube oEmbed | `https://www.youtube.com/oembed` | A student-linked YouTube video URL | Public video title/author metadata, no key required |
| Vimeo oEmbed | `https://vimeo.com/api/oembed.json` | A student-linked Vimeo video URL | Same as YouTube, no key required |
| DNS (MX/SPF/DMARC resolution) | Node's own `node:dns/promises` resolvers (not a third-party HTTP API) | A verifier's or claim's email/domain | Domain-legitimacy context (`src/lib/verification/domain-context.ts`) — **not a third party** in the subprocessor sense (uses the OS/network's configured DNS resolver, same as any DNS lookup any application makes), included here only because the audit prompt asked it be checked explicitly; no data is sent to a vendor, only standard DNS protocol queries |

All of the above are routed through `src/lib/osint/safe-fetch.ts`, which
enforces SSRF protection (blocks private/loopback/link-local/cloud-metadata
addresses, re-validates every redirect hop), robots.txt compliance,
per-domain rate limiting, a content-type allowlist, and a response-size
cap — see `docs/security.md`'s Milestone 10.6 section. None of these
lookups can be pointed at an arbitrary internal address, and none send
more than the derived domain/URL/DOI itself — no student PII (name, email,
grade) is included in any of these requests.

## Confirmed NOT wired up (per explicit audit questions)

- **Email provider**: **Still not wired up in any environment, including
  production** — re-confirmed this pass by reading
  `src/lib/email/provider.ts` in full. The only implementation is
  `ConsoleEmailProvider`, which never sends a real email; it logs a masked
  recipient/subject to the server console (and, only in local
  `NODE_ENV=development`, the full message body including any one-time
  token). `getEmailProvider()` has exactly one branch — there is no vendor
  SDK, no `RESEND_API_KEY`/`SENDGRID_API_KEY`/`POSTMARK_*`-shaped env var
  read anywhere in `src/`. Matches `docs/security.md`'s prior finding
  exactly; nothing has changed.
- **Analytics**: confirmed not present — no dependency in `package.json`,
  no `<Script>` tag, no tracking pixel, no fingerprinting call anywhere in
  `src/` (also independently confirmed by
  `docs/audit-10.10b1/cookies-client-storage.md`).
- **Error monitoring (Sentry or similar)**: no dependency in `package.json`,
  no `Sentry.init`/DSN-shaped config found.
- **CDN / image service**: `next/image` is never used anywhere in `src/`
  (grep-verified; also independently noted in `docs/security.md`'s
  Milestone 10.10A `npm audit` discussion re: the bundled `sharp`
  dependency being dead code for this app). No image-optimization or CDN
  vendor is configured.
- **Vercel-specific product (Analytics/Speed Insights/etc.)**: no
  `@vercel/*` package in `package.json`. `README.md` still carries the
  default `create-next-app` boilerplate text suggesting Vercel as a deploy
  target ("The easiest way to deploy your Next.js app is to use the Vercel
  Platform...") — this is generic scaffold copy, not confirmation of an
  actual production deployment target; no `vercel.json` exists in the repo
  (also independently noted in `retention.md`). If the app is in fact
  hosted on Vercel, Vercel itself (as the hosting platform, not a product
  SDK) would still need disclosure as an infrastructure processor even
  though no Vercel *package* is used — this cannot be confirmed from the
  repository alone.

## Summary table

| Service | Data sent | Purpose | Enabled now? | Server-only creds confirmed? | Region/residency | Retention known? | Needs policy disclosure? |
|---|---|---|---|---|---|---|---|
| Supabase | All application data, files | Database/auth/storage backend | Yes | Yes | Unknown | Unknown | Yes |
| GitHub (OAuth) | OAuth code/token exchange | Identity connect | No (unconfigured) — code-complete | Yes | Unknown | Partial (Avela-side: encrypted, soft-delete; GitHub-side: unknown) | Yes, once configured |
| GitHub (public REST API) | Repo/contributor/commit/README data | OSINT evidence | Yes (unauthenticated, keyless) | N/A (`GITHUB_TOKEN` optional, server-only) | Unknown | Unknown | Yes |
| NVIDIA (Nemotron LLM) | Evidence text, claim text | AI evidence grading | No (unconfigured) — code-complete | Yes | Unknown | Unknown | Not yet — required if ever enabled |
| URL reputation vendor | Claim URLs | Threat-intel scoring | No — heuristic-only fallback, no real vendor wired | N/A | N/A | N/A | No |
| Web search | — | — | No — not implemented | N/A | N/A | N/A | No |
| RDAP / Crossref / YouTube / Vimeo oEmbed | Public URL/domain/DOI only | Public-source verification context | Yes (keyless, no account) | N/A | Unknown | Unknown | Yes (as "public-source checks," not traditional vendors) |
| DNS (MX/SPF/DMARC) | Domain name | Verifier-email context | Yes (protocol-level, not a vendor) | N/A | N/A | N/A | No (not a subprocessor in the conventional sense) |
| Email provider | — | — | **No** | N/A | N/A | N/A | No |
| Analytics | — | — | **No** | N/A | N/A | N/A | No |
| Error monitoring | — | — | **No** | N/A | N/A | N/A | No |
| CDN/image service | — | — | **No** | N/A | N/A | N/A | No |
| Vercel product SDK | — | — | **No package used**; hosting target unconfirmed from repo | N/A | Unknown | Unknown | Only if actually hosting there (unconfirmed) |

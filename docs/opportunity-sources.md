# Opportunity source strategy

Milestone 5 builds the schema and engines to discover, verify, and rank
opportunities (see `database.md`'s Milestone 5 section), but building the
foundation is not the same as populating it. This document is the
strategy for *which sources actually go into `opportunity_sources`* once
real ingestion starts, per the spec's section 15.

## Priority order

1. **Official organization websites** — the program's own page. Highest
   trust: the organization itself controls deadline/eligibility accuracy.
2. **Government programs** — federal, state, or municipal listings (e.g.
   a state department of education's enrichment-program page).
3. **University outreach programs** — pre-college, summer, and access
   programs published directly by the university department running them.
4. **Nonprofit program pages** — the nonprofit's own site, not a
   secondary listing about it.
5. **School district resources** — counselor-curated lists a district
   publishes for its own students.
6. **Official APIs** — a structured feed a program or platform publishes
   and maintains itself.
7. **Official RSS feeds** — same trust level as an API, lower structure.
8. **Trusted directories, used only as leads** — a well-known aggregator
   (e.g. a state-run opportunity directory) can *surface* a candidate
   listing, but the record that actually gets verified and stored must
   trace back to the organization's own page, never the directory's
   summary of it.

## What is explicitly out of scope right now

Per the spec's section 10, none of these are built or planned for this
milestone:

- **A broad, unrestricted web crawler.** Every adapter built so far
  (`src/lib/opportunities/adapters/`) is manual-JSON, CSV, or an
  in-memory dev fixture — sources a human has already vetted, not
  something crawling the open web.
- **Scraping Google search-result pages.** Search results mix live and
  long-dead listings with no reliable way to tell which from the result
  page alone — exactly the "Google results are often stale" problem this
  milestone exists to solve, not reproduce.
- **Treating AI-generated search results as a source of truth.** An LLM
  summarizing "opportunities for X" can hallucinate or surface an expired
  program with total confidence. Directories and AI search may still
  *point at* candidates for a human to add as a real source, but the
  stored record's verification must always trace to the organization's
  own official page.

## Registering a new source

Each new `opportunity_sources` row is a deliberate decision, not an
automatic classification:

| Field | Guidance |
|---|---|
| `source_type` | Pick the closest match from the priority list above. |
| `trust_level` | `high` for official/government/university/nonprofit primary sources; `medium` for a school district resource or an API/feed you haven't fully vetted yet; `low` for a directory used only to surface leads. See `decision-log.md` for why this is a closed three-value scale. |
| `crawl_method` | `manual_import`/`csv_import` for anything without a feed; `rss_feed`/`api` when the source publishes one; `static_adapter` only for local development fixtures; `html_scrape` only once a specific page's structure has been reviewed by a person (never a generic crawler). |
| `requires_javascript` | Set `true` if the listing content only renders client-side — informs which extraction method (section 11) can actually read it. |

## Verification still applies per-listing, not per-source

A high-trust source does not make every individual listing automatically
`verified` — `quality.ts`'s scoring treats source trust as one input among
several (application-URL validity, deadline currency, eligibility
completeness, recency of the last check, cross-source consistency), and
`deadline.ts`/`eligibility-engine.ts` evaluate every listing's actual
content regardless of where it came from. An official source publishing a
stale page is still `stale`, not `verified`, once `last_verified_at` ages
past the recheck cadence in `recheck.ts`.

## Scheduling rechecks against real sources

`recheck.ts`'s `computeNextVerificationAt()` is a pure function today with
no scheduler wired to it. Once real sources exist, it can run through any
of:

- **Vercel Cron** — a scheduled Route Handler that queries
  `opportunities where next_verification_at <= now()` and re-runs the
  relevant adapter's `fetchDetails()`.
- **Supabase scheduled functions** (`pg_cron` + a Postgres function, or a
  scheduled Edge Function) — keeps the recheck loop entirely inside the
  Supabase project.
- **GitHub Actions** on a cron schedule — simplest to stand up without any
  new paid infrastructure, at the cost of needing the service-role key as
  a repository secret.

No option has been wired up yet, and none should be until a real source
exists to recheck against.

---

# Milestone 6 — the two real sources actually integrated

Two real, official, `.gov` sources were vetted and integrated. Both were
checked before any adapter code was written: `robots.txt` fetched and read,
the live page fetched and inspected for structure (JSON-LD/Open Graph
presence, explicit deadline/eligibility/cost text), and relevance to
Avela's middle/high-school audience confirmed.

## 1. NIST Summer High School Internship Program (SHIP)

- URL: `https://www.nist.gov/iaao/academic-affairs-office/high-school-students-ship`
- `robots.txt` (`nist.gov/robots.txt`): a `User-agent: *` section exists;
  it disallows `/core/`, `/profiles/`, admin/search/comment paths — nothing
  under `/iaao/`. This page is not blocked.
- Structure: no JSON-LD or Open Graph meta tags. Explicit prose text:
  application windows ("generally open November 1, close last week of
  January"), eligibility ("high school junior or senior"), cost ("unpaid,"
  "provide their own housing and transportation"), and a distinct apply
  page linked from the program page.
- `source_type: government`, `trust_level: high`, `crawl_method:
  html_scrape` (no better-structured feed exists for this program).

## 2. NIH Summer Internship Program (SIP)

- URL: `https://www.training.nih.gov/research-training/pb/sip/`
- `robots.txt` (`training.nih.gov/robots.txt`): disallows `/search/`,
  `/login/`, `/event-archive/`, `/form-archive/`, tracking-parameter URLs —
  nothing under `/research-training/`. Not blocked.
- Structure: no JSON-LD/Open Graph either. Explicit prose text:
  application window (opens mid-November, closes mid-February),
  eligibility (high school seniors *and* college/graduate/professional
  students — broader than NIST's program), stipend-based compensation.
- `source_type: government`, `trust_level: high`, `crawl_method:
  html_scrape`.

## Sources checked and deliberately excluded

- **`cdc.gov`** — `robots.txt` itself returned `403 Forbidden` (not just a
  disallow rule; the server refused the request outright). Per the spec's
  "skip any source that blocks automated access," CDC was not integrated.
- **`state.gov` / `exchanges.state.gov`** — the specific summer-programs
  page returned a broken "Technical Difficulties" page when fetched, and a
  related exchange-programs subdomain's `robots.txt` also returned `403`.
  Both excluded for the same reason as CDC.
- **`nhd.org`** (National History Day) — no `robots.txt` exists (a genuine
  404, which conventionally means "no crawl restrictions," not a
  disallow), so it isn't blocked. But its actual contest page didn't state
  grade eligibility or a registration deadline in the fetched content —
  thin/inconsistent enough that a reliable adapter couldn't be built
  without guessing. Excluded per "skip any source that... has unstable
  markup," not a robots/access problem.

This leaves **two** integrated sources rather than three. The spec allows
2–3; shipping two well-vetted sources was judged better than forcing a
third against thin markup. See `decision-log.md`.

## No new migration needed

Both sources' data fits entirely within the columns Milestone 5's
migration already added to `opportunities` (`verification_status`,
`deadline_status`, `eligibility_status`, `application_status`,
`last_verified_at`, `next_verification_at`, etc.) plus the existing
`opportunity_sources`/`opportunity_source_links`/`opportunity_review_queue`
tables. `supabase/migrations/20260727000000_opportunity_intelligence.sql`
is unchanged.

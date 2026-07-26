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

---

# Milestone 7 — source expansion

Goal: grow the roster from the two Milestone 6 sources toward a balanced
10-15-source catalog across federal, state/local, university, nonprofit,
museum/library, business, civic/debate, arts, STEM, and volunteering
categories — grades 8-12, official sources only, same vetting bar as
Milestone 6 (robots.txt checked for a hard block on the specific path, the
actual page fetched and confirmed to have real, stable, non-thin content
with explicit grade/deadline/cost text, never a directory summary trusted
as final truth).

20 candidates spanning every required category were checked this way
(`robots.txt` fetched, the live page fetched and inspected). **7 new
sources were accepted**, joining NIST SHIP and NIH SIP for **9 total**:

## Accepted (new this milestone)

| # | Source | Category | Trust | Crawl method | Why accepted |
|---|---|---|---|---|---|
| 1 | NASA High School Aerospace Scholars (`nasa.gov/learning-resources/high-school-aerospace-scholars/`) | Federal | high | html_scrape | robots.txt allows; single stable page; explicit grade (11th), deadline window, and free-cost text |
| 2 | WA State Legislature Senate/House Page Program (`leg.wa.gov/learn-and-participate/civic-education-programs/page-program/`) | State government / civic | high | html_scrape | No robots.txt exists (not a block, same as a from-scratch site); explicit age range ("14, not yet 17"), 2027-cycle deadline ("opens November 1st 2026"), and daily stipend ($65-67/day) |
| 3 | MIT Introduction to Technology, Engineering, and Science (MITES) (`mites.mit.edu`) | University | high | html_scrape | robots.txt only blocks `/wp-admin/`; explicit grade text ("rising high school seniors" / "7th-12th" across its sub-programs) and free-cost text; no explicit deadline text found (flagged, not fabricated) |
| 4 | YoungArts (`youngarts.org/apply`) | Arts | high | html_scrape | robots.txt allows; explicit grade/age (grades 10-12, ages 15-18), cycle deadline dates, free-to-apply text |
| 5 | Regeneron Science Talent Search / Society for Science (`societyforscience.org/regeneron-sts/`) | STEM / competition | high | html_scrape | robots.txt allows; explicit deadline (November 2026) and free-entry text; grade (seniors) inferred from program description rather than a verbatim eligibility sentence — flagged low-confidence on grade, not fabricated |
| 6 | DoSomething.org campaigns (`dosomething.org/us/campaigns`) | Volunteering | medium | **listing_scrape** | robots.txt allows; a genuine multi-item listing page — 4+ distinct campaigns, each with its own deadline — used as this milestone's multi-record adapter target (see `src/lib/opportunities/adapters/listing-adapter.ts`). **Disabled post-vetting**: a live dry-run found the site's real link structure has since moved to `/program/<slug>` and `/act-and-lead?causes=<uuid>`, not `/us/campaigns/<slug>` — removed from `scripts/ingest-opportunities.ts`'s active `SOURCES` list rather than patched with an unverified guess (see `docs/decision-log.md`'s follow-up entry). The framework and its tests remain valid. |
| 7 | Elks National Foundation "Most Valuable Student" Scholarship (`elks.org/scholars/scholarships/MVS.cfm`) | Scholarship | high | html_scrape | robots.txt only blocks `/history/*archive/PDF` paths; explicit grade (high school senior), citizenship requirement, 2027-cycle deadline (opens August 1, 2026), and award-amount text |

## Rejected (checked, not integrated) — new this milestone

| Source | Category | Reason |
|---|---|---|
| Congressional Award | Civic | Page itself returned 403 despite a permissive robots.txt |
| National Youth Science Camp | STEM | Domain chain (`nysc.org` → `nysf.com` → `nysacademy.org`) all dead ends |
| WA Legislative Youth Advisory Council | State civic | Could not locate a current, stable URL in this pass (both guessed paths 404'd) — worth revisiting with a better URL, not permanently excluded |
| Pacific Science Center teens | Museum / Seattle | The `/teens/` page itself returned 403 |
| Museum of Flight | Museum / Seattle | `robots.txt` itself returned 403 — same precedent as CDC in Milestone 6 |
| Woodland Park Zoo ZooCorps | Museum / Seattle | `robots.txt` itself returned 403 |
| University of Washington Pre-College Programs | University | Could not locate a current, stable URL in this pass — worth revisiting |
| Stanford Pre-Collegiate Studies | University | `robots.txt`'s `User-agent: *` is technically permissive, but the same file explicitly names and disallows `ClaudeBot`/`anthropic-ai`/`GPTBot`. Respecting the letter of a generic allow rule while an AI-crawler-specific block sits right next to it would be exactly the bad-faith reading "exclude blocked sources" exists to prevent — rejected on that basis, not on markup quality |
| FBLA | Business | `robots.txt` itself returned 403 |
| DECA | Business | Homepage/`/hs` load but no explicit grade/deadline/fee text — thin, same bar that excluded National History Day in Milestone 6 |
| National Speech & Debate Association | Civic / debate | `robots.txt` itself returned 403; homepage also thin |
| 4-H | Volunteering | `robots.txt` itself returned 403; page itself also 403 |
| Exploratorium High School Explainer Program | Museum / STEM | `robots.txt` itself returned 403; page itself also 403 |
| Scholastic Art & Writing Awards | Arts | Homepage loads but is thin (no grade/deadline/fee found on the fetched page) — would need a specific program subpage, not the homepage |
| Seattle Public Library teen programs | Library | robots.txt clean, but `/programs-and-services/teens` is a thin overview page — no eligibility, deadline, or application-process text |
| National Park Service youth programs | Federal / volunteering | robots.txt clean, but `/subjects/youthprograms/index.htm` is a thin portal/hub page linking to sub-pages with no program specifics on the page itself |
| Smithsonian (`naturalhistory.si.edu/education/students`) | Museum | robots.txt clean, but the page itself returned 403 |
| Junior Achievement USA | Business | robots.txt clean and org confirmed genuine, but programs are delivered per-local-chapter with no single canonical program page — not a stable adapter target |
| Diamond Challenge | Business / entrepreneurship | robots.txt clean, but the homepage has no deadline/cost text and a guessed rules subpage 404'd — thin, same bar as DECA |

## Net result and honest gap vs. the 10-15 target

**9 total sources** (2 from Milestone 6 + 7 new) is below the spec's 10-15
target. The shortfall is a real pattern in this vetting pass, not a
shortcut: **7 of 19 new candidates were blocked at the infrastructure
level** (a 403 on `robots.txt` itself or on the page itself — FBLA, 4-H,
Exploratorium, Museum of Flight, Woodland Park Zoo, Pacific Science
Center, Congressional Award), consistent with nonprofits/museums
increasingly running bot-protection in front of exactly this kind of
automated, good-faith fetch. Two more (WA LYAC, UW Pre-College Programs)
are the right organization with the wrong guessed URL — not excluded on
merit, worth a follow-up pass with the correct URL. Per Milestone 6's own
precedent (shipping 2 of an allowed 2-3 sources rather than forcing a
third against thin markup), shipping 9 well-vetted sources here is judged
better than padding the count with a directory summary, a thin page, or a
site that explicitly disallows AI crawlers.

## Multi-record listing adapter

DoSomething.org's campaign listing is the only candidate that was a
genuine multi-item index page with distinct linked detail content per
item (MIT's page describes multiple sub-programs but doesn't expose them
as separately linked detail pages, so it's built as a single-page
adapter instead). See `src/lib/opportunities/adapters/listing-adapter.ts`
for the bounded (max pages, max detail records, concurrency-limited,
one-raw-record-per-real-opportunity) multi-record adapter framework this
exercises.

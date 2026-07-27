/**
 * Admin-only real-source ingestion runner — the "one safe execution
 * method" required by Milestone 6, expanded in Milestone 7. Runs from a
 * developer/admin's own machine or CI, using the Supabase service-role
 * key, which bypasses `opportunities`'/the new tables' RLS (see
 * scripts/import-opportunities.ts for the identical convention this
 * follows). `runIngestion` itself is also reused by the authenticated
 * "Find more" Server Action (src/lib/opportunities/discovery-actions.ts,
 * Milestone 8) for a tightly bounded, rate-limited student-triggered
 * fresh-discovery pass — that path never runs this script and never
 * exposes the service-role key to the client, but it does mean the
 * ingestion pipeline is no longer *exclusively* CLI/CI-triggered.
 *
 * Usage:
 *   npm run ingest:opportunities                        # writes to the database
 *   npm run ingest:opportunities -- --dry-run            # fetch + process only, zero writes
 *   npm run ingest:opportunities -- --source=nist-ship --dry-run   # one source only
 *   npm run ingest:opportunities -- --limit=5            # cap records processed per source
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in
 * .env.local (never NEXT_PUBLIC_ for the service-role key — see
 * docs/security.md). Never prints either value, and never logs raw page
 * bodies by default (only titles/URLs/status summaries) — pass
 * `--verbose` to also print each record's rejection/queue detail, which
 * still never includes raw HTML.
 *
 * Integrates nine real, hand-vetted official sources — see
 * docs/opportunity-sources.md for why these nine (and which other
 * candidates were checked and rejected) before being added here. Nothing
 * here crawls the broader web, scrapes search results, or trusts an
 * unverified directory. One source failing (a network error, a changed
 * page structure) never stops the others — see the per-source try/catch
 * in `main()` below.
 */

// Named import, not "import nextEnv from '@next/env'; const { loadEnvConfig } = nextEnv"
// — that default-then-destructure form is specifically for Node's native
// ESM/CJS interop (see scripts/import-opportunities.ts, which runs via
// plain `node`). This script runs via `tsx` instead (required to resolve
// this file's extensionless "@/"-aliased relative imports — see
// docs/decision-log.md), whose CJS interop resolves a named import
// directly against the required module's properties, which is what
// actually works for this package under that runtime.
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

import { createElksMvsAdapter, ELKS_MVS_SOURCE } from "../src/lib/opportunities/adapters/elks-mvs-adapter";
import { createMitMitesAdapter, MIT_MITES_SOURCE } from "../src/lib/opportunities/adapters/mit-mites-adapter";
import { createNasaHsasAdapter, NASA_HSAS_SOURCE } from "../src/lib/opportunities/adapters/nasa-hsas-adapter";
import { createNihSipAdapter, NIH_SIP_SOURCE } from "../src/lib/opportunities/adapters/nih-sip-adapter";
import { createNistShipAdapter, NIST_SHIP_SOURCE } from "../src/lib/opportunities/adapters/nist-ship-adapter";
import { createRegeneronStsAdapter, REGENERON_STS_SOURCE } from "../src/lib/opportunities/adapters/regeneron-sts-adapter";
import { createWaPageProgramAdapter, WA_PAGE_PROGRAM_SOURCE } from "../src/lib/opportunities/adapters/wa-page-program-adapter";
import { createYoungArtsAdapter, YOUNGARTS_SOURCE } from "../src/lib/opportunities/adapters/youngarts-adapter";
import { consoleLogger, runIngestion, type IngestionSourceConfig } from "../src/lib/opportunities/ingestion-runner";
import { createSupabaseIngestionRepository } from "../src/lib/opportunities/supabase-ingestion-repository";
import type { Database } from "../src/types/database";

loadEnvConfig(process.cwd());

// Eight real, hand-vetted, currently-active official sources (see
// docs/opportunity-sources.md for the full accept/reject trail across 20
// checked candidates). Every entry's `createAdapter` takes only a
// sourceId — none of them accept a student-supplied or otherwise
// arbitrary URL.
//
// DoSomething.org (`dosomething`) is intentionally NOT registered here.
// It passed initial vetting as a genuine multi-item listing page, but a
// live dry-run against the real site (post-acceptance verification, not
// just a one-time robots.txt/structure check) found the site's actual
// link structure has since changed to `/program/<slug>` and
// `/act-and-lead?causes=<uuid>` — neither matches the `/us/campaigns/
// <slug>` pattern `dosomething-adapter.ts`'s `extractDetailUrls` was
// built against, so it now reliably finds zero records. Per this
// project's standing rule ("disable or reject an adapter rather than
// pretend it works"), it's disabled here rather than patched with an
// unverified guess at the new structure. The adapter file, its
// `listing-adapter.ts` framework, and their tests are kept — the
// framework itself is validated and reusable; only this one live source
// mapping is stale. See docs/decision-log.md's Milestone 7 follow-up
// entry.
const SOURCES = [
  { key: "nist-ship", ...NIST_SHIP_SOURCE, organizationHint: "National Institute of Standards and Technology (NIST)", defaultOpportunityType: "internship" as const, defaultFormat: "in_person" as const, createAdapter: createNistShipAdapter },
  { key: "nih-sip", ...NIH_SIP_SOURCE, organizationHint: "National Institutes of Health (NIH)", defaultOpportunityType: "internship" as const, defaultFormat: "in_person" as const, createAdapter: createNihSipAdapter },
  { key: "nasa-hsas", ...NASA_HSAS_SOURCE, organizationHint: "NASA Johnson Space Center", defaultOpportunityType: "summer_program" as const, defaultFormat: "hybrid" as const, createAdapter: createNasaHsasAdapter },
  { key: "wa-page-program", ...WA_PAGE_PROGRAM_SOURCE, organizationHint: "Washington State Legislature", defaultOpportunityType: "internship" as const, defaultFormat: "in_person" as const, createAdapter: createWaPageProgramAdapter },
  { key: "mit-mites", ...MIT_MITES_SOURCE, organizationHint: "Massachusetts Institute of Technology (MIT)", defaultOpportunityType: "summer_program" as const, defaultFormat: "in_person" as const, createAdapter: createMitMitesAdapter },
  { key: "youngarts", ...YOUNGARTS_SOURCE, organizationHint: "YoungArts", defaultOpportunityType: "competition" as const, defaultFormat: "hybrid" as const, createAdapter: createYoungArtsAdapter },
  { key: "regeneron-sts", ...REGENERON_STS_SOURCE, organizationHint: "Society for Science", defaultOpportunityType: "competition" as const, defaultFormat: "virtual" as const, createAdapter: createRegeneronStsAdapter },
  { key: "elks-mvs", ...ELKS_MVS_SOURCE, organizationHint: "Elks National Foundation", defaultOpportunityType: "scholarship" as const, defaultFormat: "virtual" as const, createAdapter: createElksMvsAdapter },
] as const;

function parseSourceFilter(argv: string[]): string | null {
  const arg = argv.find((a) => a.startsWith("--source="));
  return arg ? arg.slice("--source=".length) : null;
}

function parseLimit(argv: string[]): number | null {
  const arg = argv.find((a) => a.startsWith("--limit="));
  if (!arg) return null;
  const value = Number.parseInt(arg.slice("--limit=".length), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function ensureSourceRow(
  supabase: ReturnType<typeof createClient<Database>>,
  source: (typeof SOURCES)[number]
): Promise<string> {
  const { data: existing, error: selectError } = await supabase
    .from("opportunity_sources")
    .select("id")
    .eq("base_url", source.baseUrl)
    .maybeSingle();
  if (selectError) throw new Error(`Failed to look up source "${source.name}": ${selectError.message}`);
  if (existing) return existing.id;

  const { data: inserted, error: insertError } = await supabase
    .from("opportunity_sources")
    .insert({
      name: source.name,
      base_url: source.baseUrl,
      source_type: source.sourceType,
      trust_level: source.trustLevel,
      crawl_method: source.crawlMethod,
      requires_javascript: source.requiresJavascript,
    })
    .select("id")
    .single();
  if (insertError || !inserted) throw new Error(`Failed to register source "${source.name}": ${insertError?.message}`);
  return inserted.id;
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const verbose = argv.includes("--verbose");
  const sourceFilter = parseSourceFilter(argv);
  const recordLimit = parseLimit(argv) ?? undefined;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set SUPABASE_SERVICE_ROLE_KEY in .env.local (never commit it) — see docs/security.md."
    );
    process.exitCode = 1;
    return;
  }

  const sourcesToRun = sourceFilter ? SOURCES.filter((s) => s.key === sourceFilter) : SOURCES;
  if (sourceFilter && sourcesToRun.length === 0) {
    console.error(
      `[ingestion] --source=${sourceFilter} matched no configured source. Known keys: ${SOURCES.map((s) => s.key).join(", ")}`
    );
    process.exitCode = 1;
    return;
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const repository = createSupabaseIngestionRepository(supabase);

  console.log(
    `[ingestion] starting run — dryRun=${dryRun}, sources=${sourcesToRun.length}${recordLimit ? `, limit=${recordLimit}` : ""}`
  );

  let overallFailed = false;

  // Each source runs in its own try/catch so one source's registration or
  // network failure never stops the rest (spec section 11,
  // "fail-one-source-without-stopping-all"). Idempotent reruns: dedupe.ts
  // + upsertSourceLink already make re-running the same source safe —
  // an unchanged page updates the same row rather than creating a
  // duplicate (see ingestion-runner.ts's dedupe branch).
  for (const source of sourcesToRun) {
    try {
      const sourceId = dryRun ? source.baseUrl : await ensureSourceRow(supabase, source);

      const config: IngestionSourceConfig = {
        id: sourceId,
        organizationHint: source.organizationHint,
        trustLevel: source.trustLevel,
        defaultOpportunityType: source.defaultOpportunityType,
        defaultFormat: source.defaultFormat,
      };

      const adapter = source.createAdapter(sourceId);

      const summary = await runIngestion({
        source: config,
        adapter,
        repository,
        dryRun,
        recordLimit,
        logger: consoleLogger,
      });

      if (summary.status === "failed") overallFailed = true;

      console.log(
        `[ingestion] ${source.name}: found=${summary.itemsFound} created=${summary.itemsCreated} updated=${summary.itemsUpdated} rejected=${summary.itemsRejected} queued=${summary.itemsQueued}`
      );
      if (dryRun || verbose) {
        for (const record of summary.records) {
          console.log(
            `  [dry-run] ${record.action} — ${record.title ?? "(no title)"} <${record.sourceUrl}>${
              record.rejectionReason ? ` — ${record.rejectionReason}` : ""
            }${record.queuedReasons.length > 0 ? ` — queued: ${record.queuedReasons.join(", ")}` : ""}`
          );
        }
      }
    } catch (error) {
      overallFailed = true;
      console.error(`[ingestion] source "${source.name}" failed unexpectedly:`, (error as Error).message);
    }
  }

  if (overallFailed) {
    process.exitCode = 1;
  }
}

main();

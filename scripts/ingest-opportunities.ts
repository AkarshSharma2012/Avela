/**
 * Admin-only real-source ingestion runner — the "one safe execution
 * method" required by Milestone 6. Never exposed through any Next.js
 * route, Server Action, or client-reachable API: it only runs from a
 * developer/admin's own machine or CI, using the Supabase service-role
 * key, which bypasses `opportunities`'/the new tables' RLS (see
 * scripts/import-opportunities.ts for the identical convention this
 * follows).
 *
 * Usage:
 *   npm run ingest:opportunities                 # writes to the database
 *   npm run ingest:opportunities -- --dry-run     # fetch + process only, zero writes
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in
 * .env.local (never NEXT_PUBLIC_ for the service-role key — see
 * docs/security.md). Never prints either value.
 *
 * Integrates exactly two real, hand-vetted official sources — see
 * docs/opportunity-sources.md for why these two and how they were
 * checked (robots.txt, structure) before being added here. Nothing here
 * crawls the broader web, scrapes search results, or trusts an
 * unverified directory.
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

import { createNihSipAdapter, NIH_SIP_SOURCE } from "../src/lib/opportunities/adapters/nih-sip-adapter";
import { createNistShipAdapter, NIST_SHIP_SOURCE } from "../src/lib/opportunities/adapters/nist-ship-adapter";
import { consoleLogger, runIngestion, type IngestionSourceConfig } from "../src/lib/opportunities/ingestion-runner";
import { createSupabaseIngestionRepository } from "../src/lib/opportunities/supabase-ingestion-repository";
import type { Database } from "../src/types/database";

loadEnvConfig(process.cwd());

const SOURCES = [
  { key: "nist-ship", ...NIST_SHIP_SOURCE, organizationHint: "National Institute of Standards and Technology (NIST)", createAdapter: createNistShipAdapter },
  { key: "nih-sip", ...NIH_SIP_SOURCE, organizationHint: "National Institutes of Health (NIH)", createAdapter: createNihSipAdapter },
] as const;

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
  const dryRun = process.argv.includes("--dry-run");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set SUPABASE_SERVICE_ROLE_KEY in .env.local (never commit it) — see docs/security.md."
    );
    process.exitCode = 1;
    return;
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const repository = createSupabaseIngestionRepository(supabase);

  console.log(`[ingestion] starting run — dryRun=${dryRun}, sources=${SOURCES.length}`);

  let overallFailed = false;

  for (const source of SOURCES) {
    let sourceId: string;
    try {
      sourceId = dryRun ? source.baseUrl : await ensureSourceRow(supabase, source);
    } catch (error) {
      overallFailed = true;
      console.error(`[ingestion] could not register source "${source.name}":`, (error as Error).message);
      continue;
    }

    const config: IngestionSourceConfig = {
      id: sourceId,
      organizationHint: source.organizationHint,
      trustLevel: source.trustLevel,
      defaultOpportunityType: "internship",
      defaultFormat: "in_person",
    };

    const adapter = source.createAdapter(sourceId);

    const summary = await runIngestion({
      source: config,
      adapter,
      repository,
      dryRun,
      logger: consoleLogger,
    });

    if (summary.status === "failed") overallFailed = true;

    console.log(
      `[ingestion] ${source.name}: found=${summary.itemsFound} created=${summary.itemsCreated} updated=${summary.itemsUpdated} rejected=${summary.itemsRejected} queued=${summary.itemsQueued}`
    );
    if (dryRun) {
      for (const record of summary.records) {
        console.log(
          `  [dry-run] ${record.action} — ${record.title ?? "(no title)"} <${record.sourceUrl}>${
            record.rejectionReason ? ` — ${record.rejectionReason}` : ""
          }${record.queuedReasons.length > 0 ? ` — queued: ${record.queuedReasons.join(", ")}` : ""}`
        );
      }
    }
  }

  if (overallFailed) {
    process.exitCode = 1;
  }
}

main();

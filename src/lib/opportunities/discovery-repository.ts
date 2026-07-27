import { createClient as createServiceRoleClient, type SupabaseClient } from "@supabase/supabase-js";

import type { DiscoverySourceDefinition } from "@/lib/opportunities/discovery-sources";
import type { DiscoveryRepository } from "@/lib/opportunities/discovery";
import { createSupabaseIngestionRepository } from "@/lib/opportunities/supabase-ingestion-repository";
import type { Database } from "@/types/database";
import type { Opportunity } from "@/types/opportunity";

type Client = SupabaseClient<Database>;

/**
 * `opportunity_sources`/ingestion-internal tables are RLS-enabled with zero
 * client-facing policies (see supabase/migrations/20260727000000_opportunity_intelligence.sql)
 * — only a service-role connection can register a source or write a
 * discovered opportunity. This is the one place that boundary is opened up
 * beyond `scripts/ingest-opportunities.ts`, and only for the bounded,
 * rate-limited "Find more" path (see discovery-actions.ts, which is what
 * actually authenticates the caller before this is ever constructed).
 */
export function createDiscoveryServiceRoleClient(): Client {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — required for fresh discovery ingestion."
    );
  }
  return createServiceRoleClient<Database>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

/** Same lookup-or-register pattern as `scripts/ingest-opportunities.ts`'s `ensureSourceRow`, keyed by base URL. */
async function resolveSourceId(serviceClient: Client, source: DiscoverySourceDefinition): Promise<string> {
  const { data: existing, error: selectError } = await serviceClient
    .from("opportunity_sources")
    .select("id")
    .eq("base_url", source.baseUrl)
    .maybeSingle();
  if (selectError) throw new Error(`Failed to look up source "${source.name}": ${selectError.message}`);
  if (existing) return existing.id;

  const { data: inserted, error: insertError } = await serviceClient
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
  if (insertError || !inserted) {
    throw new Error(`Failed to register source "${source.name}": ${insertError?.message}`);
  }
  return inserted.id;
}

/**
 * The one real `DiscoveryRepository` implementation. Reads go through the
 * authenticated (RLS-scoped) client — students can already select active
 * opportunities — writes to the shared catalog go through the service-role
 * client, since `opportunities`/`opportunity_sources` have no client-facing
 * insert policy (matches ingestion's existing privilege split exactly).
 */
export function createSupabaseDiscoveryRepository(authClient: Client, serviceClient: Client): DiscoveryRepository {
  return {
    ingestion: createSupabaseIngestionRepository(serviceClient),

    resolveSourceId: (source) => resolveSourceId(serviceClient, source),

    async getFreshOpportunities(sourceId, excludeIds, now) {
      const { data, error } = await authClient
        .from("opportunities")
        .select("*")
        .eq("source_id", sourceId)
        .eq("is_active", true)
        .eq("is_sample", false)
        .or(`next_verification_at.is.null,next_verification_at.gt.${now.toISOString()}`);
      if (error) throw new Error(`Failed to load fresh opportunities for source ${sourceId}: ${error.message}`);
      return ((data ?? []) as Opportunity[]).filter((o) => !excludeIds.has(o.id));
    },

    async getOpportunitiesByIds(ids) {
      if (ids.length === 0) return [];
      const { data, error } = await authClient.from("opportunities").select("*").in("id", ids as string[]);
      if (error) throw new Error(`Failed to load opportunities by id: ${error.message}`);
      return (data ?? []) as Opportunity[];
    },
  };
}

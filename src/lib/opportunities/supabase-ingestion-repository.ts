import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  DedupeCandidateRow,
  IngestionRepository,
  NewOpportunityFields,
  OpportunityPatch,
} from "@/lib/opportunities/ingestion-repository";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

/**
 * The one real `IngestionRepository` implementation — a thin wrapper
 * around a service-role Supabase client. Used only by
 * `scripts/ingest-opportunities.ts`, never by application code under
 * `src/app/`. Not unit-tested itself (it has nothing but Postgrest calls,
 * the same reason `scripts/import-opportunities.ts` isn't — see
 * docs/testing.md); `ingestion-runner.ts`'s actual logic is tested against
 * a fake implementation of this interface instead.
 */
export function createSupabaseIngestionRepository(supabase: Client): IngestionRepository {
  return {
    async createIngestionRun(sourceId, startedAt) {
      const { data, error } = await supabase
        .from("opportunity_ingestion_runs")
        .insert({ source_id: sourceId, status: "running", started_at: startedAt })
        .select("id")
        .single();
      if (error || !data) throw new Error(`Failed to create ingestion run: ${error?.message}`);
      return data.id;
    },

    async completeIngestionRun(runId, result) {
      const { error } = await supabase
        .from("opportunity_ingestion_runs")
        .update({
          status: result.status,
          completed_at: new Date().toISOString(),
          items_found: result.itemsFound,
          items_created: result.itemsCreated,
          items_updated: result.itemsUpdated,
          items_rejected: result.itemsRejected,
          error_summary: result.errorSummary,
        })
        .eq("id", runId);
      if (error) throw new Error(`Failed to complete ingestion run: ${error.message}`);
    },

    async insertRawRecord({ sourceId, ingestionRunId, record, processingStatus, processingError }) {
      const { error } = await supabase.from("raw_opportunity_records").insert({
        source_id: sourceId,
        ingestion_run_id: ingestionRunId,
        source_url: record.sourceUrl,
        raw_title: record.rawTitle,
        raw_content: record.rawContent,
        raw_metadata: record.rawMetadata,
        content_hash: record.contentHash,
        fetched_at: record.fetchedAt,
        processing_status: processingStatus,
        processing_error: processingError,
      });
      if (error) throw new Error(`Failed to insert raw record: ${error.message}`);
    },

    async findDedupeCandidates({ organization, applicationUrl }): Promise<DedupeCandidateRow[]> {
      const { data: opportunities, error } = await supabase
        .from("opportunities")
        .select(
          "id, title, organization, canonical_url, application_url, source_url, application_deadline"
        )
        .or(`organization.eq.${organization},application_url.eq.${applicationUrl}`)
        .limit(20);
      if (error) throw new Error(`Failed to look up dedupe candidates: ${error.message}`);
      if (!opportunities || opportunities.length === 0) return [];

      const ids = opportunities.map((o) => o.id);
      const { data: links, error: linksError } = await supabase
        .from("opportunity_source_links")
        .select("opportunity_id, source_id, is_primary")
        .in("opportunity_id", ids);
      if (linksError) throw new Error(`Failed to look up source links: ${linksError.message}`);

      const primarySourceIdByOpportunity = new Map<string, string>();
      const linkCountByOpportunity = new Map<string, number>();
      for (const link of links ?? []) {
        linkCountByOpportunity.set(link.opportunity_id, (linkCountByOpportunity.get(link.opportunity_id) ?? 0) + 1);
        if (link.is_primary) primarySourceIdByOpportunity.set(link.opportunity_id, link.source_id);
      }

      const primarySourceIds = [...new Set([...primarySourceIdByOpportunity.values()])];
      const { data: sources, error: sourcesError } =
        primarySourceIds.length > 0
          ? await supabase.from("opportunity_sources").select("id, trust_level").in("id", primarySourceIds)
          : { data: [], error: null };
      if (sourcesError) throw new Error(`Failed to look up source trust levels: ${sourcesError.message}`);
      const trustLevelBySourceId = new Map((sources ?? []).map((s) => [s.id, s.trust_level]));

      return opportunities.map((o) => {
        const primarySourceId = primarySourceIdByOpportunity.get(o.id) ?? null;
        return {
          id: o.id,
          title: o.title,
          organization: o.organization,
          canonicalUrl: o.canonical_url,
          applicationUrl: o.application_url,
          sourceUrl: o.source_url,
          applicationDeadline: o.application_deadline,
          primarySourceId,
          primarySourceTrustLevel: primarySourceId ? (trustLevelBySourceId.get(primarySourceId) ?? null) : null,
          sourceLinkCount: linkCountByOpportunity.get(o.id) ?? 0,
        };
      });
    },

    async insertOpportunity(fields: NewOpportunityFields) {
      const { data, error } = await supabase
        .from("opportunities")
        .insert({
          ...fields,
          is_active: true,
          is_sample: false,
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(`Failed to insert opportunity: ${error?.message}`);
      return data.id;
    },

    async updateOpportunity(id: string, patch: OpportunityPatch) {
      const { error } = await supabase
        .from("opportunities")
        .update({ ...patch, last_seen_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(`Failed to update opportunity ${id}: ${error.message}`);
    },

    async upsertSourceLink({ opportunityId, sourceId, sourceUrl, isPrimary }) {
      if (isPrimary) {
        const { error: clearError } = await supabase
          .from("opportunity_source_links")
          .update({ is_primary: false })
          .eq("opportunity_id", opportunityId)
          .neq("source_id", sourceId);
        if (clearError) throw new Error(`Failed to clear prior primary source link: ${clearError.message}`);
      }

      const { error } = await supabase.from("opportunity_source_links").upsert(
        {
          opportunity_id: opportunityId,
          source_id: sourceId,
          source_url: sourceUrl,
          last_seen_at: new Date().toISOString(),
          is_primary: isPrimary,
        },
        { onConflict: "opportunity_id,source_id" }
      );
      if (error) throw new Error(`Failed to upsert source link: ${error.message}`);
    },

    async insertReviewQueueEntries(entries) {
      if (entries.length === 0) return;
      const { error } = await supabase.from("opportunity_review_queue").insert(
        entries.map((entry) => ({
          opportunity_id: entry.opportunityId,
          raw_record_id: null,
          reason: entry.reason,
        }))
      );
      if (error) throw new Error(`Failed to insert review queue entries: ${error.message}`);
    },
  };
}

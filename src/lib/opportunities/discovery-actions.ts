"use server";

import { getCurrentProfile } from "@/lib/auth/dal";
import { getOnboardingSummary } from "@/lib/onboarding/dal";
import type { DiscoveryCandidate } from "@/lib/opportunities/discovery";
import { createDiscoveryServiceRoleClient, createSupabaseDiscoveryRepository } from "@/lib/opportunities/discovery-repository";
import {
  findMoreOpportunities,
  type FindMoreDependencies,
  type FindMoreStatus,
} from "@/lib/opportunities/find-more";
import { buildMatchProfileInput } from "@/lib/opportunities/matching";
import { getOpportunitySourceNames, listOpportunitiesForMatching } from "@/lib/opportunities/query";
import { createClient } from "@/lib/supabase/server";

export type FindMoreActionResult =
  | {
      ok: true;
      status: FindMoreStatus;
      message: string | null;
      recommendations: {
        opportunity: DiscoveryCandidate["opportunity"];
        matchResult: DiscoveryCandidate["matchResult"];
        eligibilityResult: DiscoveryCandidate["eligibilityResult"];
        sourceName: string | null;
      }[];
    }
  | { ok: false; message: string };

/** The next batch number for this student, derived from their own persisted history — never client-supplied. */
async function getNextBatchNumber(authClient: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<number> {
  const { data, error } = await authClient
    .from("student_opportunity_recommendations")
    .select("batch_number")
    .eq("user_id", userId)
    .order("batch_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to read prior batch number: ${error.message}`);
  return (data?.batch_number ?? -1) + 1;
}

function buildDependencies(
  authClient: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Pick<
  FindMoreDependencies,
  | "countRecentDiscoveryRuns"
  | "hasActiveDiscoveryRun"
  | "createDiscoveryRun"
  | "updateDiscoveryRunStatus"
  | "completeDiscoveryRun"
  | "insertRecommendations"
> {
  return {
    async countRecentDiscoveryRuns(uid, since) {
      const { count, error } = await authClient
        .from("student_discovery_runs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .gte("started_at", since.toISOString());
      if (error) throw new Error(`Failed to count recent discovery runs: ${error.message}`);
      return count ?? 0;
    },

    async hasActiveDiscoveryRun(uid) {
      const { data, error } = await authClient
        .from("student_discovery_runs")
        .select("id")
        .eq("user_id", uid)
        .not("status", "in", "(completed,failed)")
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`Failed to check active discovery runs: ${error.message}`);
      return data !== null;
    },

    async createDiscoveryRun({ batchNumber, sourcesSelected, profileSnapshot }) {
      const { data, error } = await authClient
        .from("student_discovery_runs")
        .insert({
          user_id: userId,
          batch_number: batchNumber,
          sources_selected: sourcesSelected,
          profile_snapshot: profileSnapshot,
        })
        .select("id")
        .single();
      // 23505 (unique_violation) here means the one-active-run-per-user
      // partial index (see the migration) caught a race the app-level
      // hasActiveDiscoveryRun check missed — two near-simultaneous clicks.
      // A distinguishable error lets the caller map this back to the same
      // friendly "already running" message instead of a raw crash.
      if (error?.code === "23505") throw new Error("CONCURRENT_RUN_BLOCKED");
      if (error || !data) throw new Error(`Failed to create discovery run: ${error?.message}`);
      return data.id;
    },

    async updateDiscoveryRunStatus(runId, status) {
      const { error } = await authClient.from("student_discovery_runs").update({ status }).eq("id", runId);
      if (error) throw new Error(`Failed to update discovery run status: ${error.message}`);
    },

    async completeDiscoveryRun(runId, result) {
      const { error } = await authClient
        .from("student_discovery_runs")
        .update({
          status: result.status,
          completed_at: new Date().toISOString(),
          results_found: result.resultsFound,
          error_summary: result.errorSummary,
        })
        .eq("id", runId);
      if (error) throw new Error(`Failed to complete discovery run: ${error.message}`);
    },

    async insertRecommendations(rows) {
      if (rows.length === 0) return;
      const { error } = await authClient.from("student_opportunity_recommendations").upsert(
        rows.map((row) => ({
          user_id: userId,
          opportunity_id: row.opportunityId,
          discovery_run_id: row.discoveryRunId,
          batch_number: row.batchNumber,
          personalized_rank: row.personalizedRank,
          recommendation_tier: row.recommendationTier,
          fit_reasons: row.fitReasons,
          concerns: row.concerns,
        })),
        { onConflict: "user_id,opportunity_id", ignoreDuplicates: true }
      );
      if (error) throw new Error(`Failed to persist recommendations: ${error.message}`);
    },
  };
}

/**
 * Server Action behind the dashboard's "Find more" button once the unseen
 * verified catalog is exhausted. Identity comes from the session only —
 * never from a client-supplied user id — and the already-shown exclusion
 * set is recomputed server-side (the full catalog pool, since this only
 * ever runs once that pool has been fully paged through, unioned with this
 * student's persisted recommendation history) rather than trusted from the
 * caller.
 */
export async function findMoreAction(): Promise<FindMoreActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, message: "Please sign in again to search for more opportunities." };
  }

  const authClient = await createClient();
  const onboardingSummary = await getOnboardingSummary(profile.id);
  const matchProfileInput = buildMatchProfileInput(profile, onboardingSummary);

  const [{ data: pool, error: poolError }, { data: persisted, error: persistedError }] = await Promise.all([
    listOpportunitiesForMatching(authClient, profile.grade_level, { studentState: profile.state }),
    authClient.from("student_opportunity_recommendations").select("opportunity_id").eq("user_id", profile.id),
  ]);
  if (poolError) return { ok: false, message: poolError };
  if (persistedError) {
    return { ok: false, message: "Couldn't load your recommendation history — please try again." };
  }

  const alreadyShownOpportunityIds = new Set<string>([
    ...pool.map((o) => o.id),
    ...(persisted ?? []).map((r) => r.opportunity_id),
  ]);

  let serviceClient;
  try {
    serviceClient = createDiscoveryServiceRoleClient();
  } catch {
    return { ok: false, message: "Discovery isn't available right now — please try again later." };
  }

  let outcome;
  try {
    const batchNumber = await getNextBatchNumber(authClient, profile.id);
    const discoveryRepository = createSupabaseDiscoveryRepository(authClient, serviceClient);

    outcome = await findMoreOpportunities({
      userId: profile.id,
      profile: matchProfileInput,
      alreadyShownOpportunityIds,
      batchNumber,
      discoveryRepository,
      listCatalogPool: async () => pool,
      ...buildDependencies(authClient, profile.id),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "CONCURRENT_RUN_BLOCKED") {
      return {
        ok: true,
        status: "concurrent_run_blocked",
        message: "A search is already running for you — hang tight and try again shortly.",
        recommendations: [],
      };
    }
    // Never surface a raw internal/DB error message to the client.
    return { ok: false, message: "Something went wrong while searching for more opportunities — please try again." };
  }

  const sourceIds = outcome.recommendations
    .map((c) => c.opportunity.source_id)
    .filter((id): id is string => id !== null);
  const sourceNames = await getOpportunitySourceNames(authClient, sourceIds);

  return {
    ok: true,
    status: outcome.status,
    message: outcome.message,
    recommendations: outcome.recommendations.map((candidate) => ({
      opportunity: candidate.opportunity,
      matchResult: candidate.matchResult,
      eligibilityResult: candidate.eligibilityResult,
      sourceName: candidate.opportunity.source_id
        ? (sourceNames.get(candidate.opportunity.source_id) ?? null)
        : null,
    })),
  };
}

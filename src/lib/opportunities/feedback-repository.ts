import type { SupabaseClient } from "@supabase/supabase-js";

import { buildFeedbackProfile, type FeedbackProfile } from "@/lib/opportunities/feedback";
import type { Database, RecommendationFeedbackType } from "@/types/database";

type Client = SupabaseClient<Database>;

/**
 * The net-per-type signal `chosen-for-you.ts`/`discovery.ts` fold into
 * ranking and `discovery-sources.ts` folds into source scoring. Two
 * queries rather than an embedded join — same reasoning `getSavedOpportunities`
 * already documents in query.ts (hand-written `Relationships` typing is
 * fragile for embeds).
 */
export async function getFeedbackProfileForUser(supabase: Client, userId: string): Promise<FeedbackProfile> {
  const { data: feedbackRows, error: feedbackError } = await supabase
    .from("recommendation_feedback")
    .select("feedback_type, opportunity_id")
    .eq("user_id", userId);

  if (feedbackError) {
    console.error("[opportunities] failed to load recommendation feedback:", feedbackError.message);
    return new Map();
  }
  if (!feedbackRows || feedbackRows.length === 0) return new Map();

  const opportunityIds = [...new Set(feedbackRows.map((row) => row.opportunity_id))];
  const { data: opportunities, error: opportunitiesError } = await supabase
    .from("opportunities")
    .select("id, opportunity_type")
    .in("id", opportunityIds);

  if (opportunitiesError) {
    console.error("[opportunities] failed to load feedback opportunity types:", opportunitiesError.message);
    return new Map();
  }

  const typeById = new Map((opportunities ?? []).map((o) => [o.id, o.opportunity_type]));

  return buildFeedbackProfile(
    feedbackRows
      .map((row) => {
        const opportunityType = typeById.get(row.opportunity_id);
        return opportunityType ? { feedbackType: row.feedback_type, opportunityType } : null;
      })
      .filter((entry): entry is { feedbackType: RecommendationFeedbackType; opportunityType: NonNullable<typeof entry>["opportunityType"] } => entry !== null)
  );
}

/** Every opportunity this student has dismissed — excluded from every future "Chosen for You" batch, the same "durable, cross-batch" guarantee the migration's own comment describes. */
export async function getDismissedOpportunityIds(supabase: Client, userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("recommendation_feedback")
    .select("opportunity_id")
    .eq("user_id", userId)
    .eq("feedback_type", "dismissed");

  if (error) {
    console.error("[opportunities] failed to load dismissed opportunity ids:", error.message);
    return new Set();
  }

  return new Set((data ?? []).map((row) => row.opportunity_id));
}

/** Per-card feedback state (which of the non-dismiss actions a student already took on a shown opportunity) — dismissed opportunities are never in this map's callers' pools at all, so `dismissed` doesn't need a place here. */
export async function getFeedbackStateForOpportunities(
  supabase: Client,
  userId: string,
  opportunityIds: readonly string[]
): Promise<Map<string, Set<RecommendationFeedbackType>>> {
  const uniqueIds = [...new Set(opportunityIds)];
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("recommendation_feedback")
    .select("opportunity_id, feedback_type")
    .eq("user_id", userId)
    .in("opportunity_id", uniqueIds);

  if (error) {
    console.error("[opportunities] failed to load feedback state:", error.message);
    return new Map();
  }

  const byOpportunity = new Map<string, Set<RecommendationFeedbackType>>();
  for (const row of data ?? []) {
    const existing = byOpportunity.get(row.opportunity_id) ?? new Set<RecommendationFeedbackType>();
    existing.add(row.feedback_type);
    byOpportunity.set(row.opportunity_id, existing);
  }
  return byOpportunity;
}

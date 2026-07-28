/**
 * Dependency-free recommendation-feedback logic, separated from
 * `feedback-actions.ts` the same way `save.ts` is separated from
 * `save-actions.ts` — identity always comes from an already-resolved
 * session user id, never a client-supplied one, and the validation here
 * (reason only on a `dismissed` row, `reminderAt` only on a `remind_later`
 * row) mirrors the migration's own check constraints so a bad write is
 * rejected with a friendly message before it ever reaches Postgres.
 */

import type { OpportunityType, RecommendationFeedbackReason, RecommendationFeedbackType } from "@/types/database";

export type FeedbackResult = { success: true } | { success: false; error: string };

export type FeedbackInput = {
  feedbackType: RecommendationFeedbackType;
  reason?: RecommendationFeedbackReason | null;
  reminderAt?: string | null;
  recommendationId?: string | null;
};

type WriteFn = (userId: string, opportunityId: string, input: FeedbackInput) => Promise<{ error: string | null }>;
type RemoveFn = (userId: string, opportunityId: string, feedbackType: RecommendationFeedbackType) => Promise<{ error: string | null }>;

function validate(input: FeedbackInput): string | null {
  if (input.reason != null && input.feedbackType !== "dismissed") {
    return "A reason can only be given when dismissing an opportunity.";
  }
  if (input.reminderAt != null && input.feedbackType !== "remind_later") {
    return "A reminder time can only be set on a 'remind me later' response.";
  }
  return null;
}

export async function giveFeedbackForUser(
  userId: string | null,
  opportunityId: string,
  input: FeedbackInput,
  write: WriteFn
): Promise<FeedbackResult> {
  if (userId === null) {
    return { success: false, error: "You need to be signed in to do that." };
  }

  const validationError = validate(input);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const { error } = await write(userId, opportunityId, input);
  if (error) {
    console.error("[opportunities] failed to record recommendation feedback:", error);
    return { success: false, error: "Couldn't save your response. Please try again." };
  }

  return { success: true };
}

export async function removeFeedbackForUser(
  userId: string | null,
  opportunityId: string,
  feedbackType: RecommendationFeedbackType,
  remove: RemoveFn
): Promise<FeedbackResult> {
  if (userId === null) {
    return { success: false, error: "You need to be signed in to do that." };
  }

  const { error } = await remove(userId, opportunityId, feedbackType);
  if (error) {
    console.error("[opportunities] failed to remove recommendation feedback:", error);
    return { success: false, error: "Couldn't undo that. Please try again." };
  }

  return { success: true };
}

/** A net preference signal per opportunity type, built from a student's own feedback history. Never a raw count exposed to the UI — see `computeFeedbackSignal`. */
export type FeedbackProfile = ReadonlyMap<OpportunityType, number>;

/** Feedback types that carry a preference direction. `remind_later` is a scheduling signal, not a like/dislike, so it never moves the score — and `saved` only ever enters this through the `saved_opportunities` sync in save-actions.ts, never a second, independent "I like this" click. */
const FEEDBACK_WEIGHT: Partial<Record<RecommendationFeedbackType, number>> = {
  dismissed: -1,
  more_like_this: 1,
  help_me_apply: 1,
  saved: 1,
};

/**
 * Aggregates a student's own feedback rows into one net score per
 * opportunity type. Deliberately coarse (opportunity type, not
 * organization or individual listing) — a durable cross-batch signal
 * needs to generalize past the exact items a student has already seen,
 * and type is the one dimension every opportunity always has.
 */
export function buildFeedbackProfile(
  entries: readonly { feedbackType: RecommendationFeedbackType; opportunityType: OpportunityType }[]
): FeedbackProfile {
  const scores = new Map<OpportunityType, number>();
  for (const entry of entries) {
    const weight = FEEDBACK_WEIGHT[entry.feedbackType];
    if (!weight) continue;
    scores.set(entry.opportunityType, (scores.get(entry.opportunityType) ?? 0) + weight);
  }
  return scores;
}

export type FeedbackSignal = "boost" | "neutral" | "penalize";

/** Bounded, three-valued read of the profile — never a percentage or a raw score, and never anything ranking.ts/discovery-sources.ts could mistake for a stronger signal than eligibility or verification. */
export function computeFeedbackSignal(opportunityType: OpportunityType, profile: FeedbackProfile): FeedbackSignal {
  const score = profile.get(opportunityType) ?? 0;
  if (score > 0) return "boost";
  if (score < 0) return "penalize";
  return "neutral";
}

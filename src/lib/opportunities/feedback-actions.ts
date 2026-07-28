"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedUser } from "@/lib/auth/dal";
import { giveFeedbackForUser, removeFeedbackForUser, type FeedbackInput } from "@/lib/opportunities/feedback";
import { createClient } from "@/lib/supabase/server";
import type { RecommendationFeedbackReason, RecommendationFeedbackType } from "@/types/database";

export type FeedbackActionResult = { error?: string };

function revalidateFeedbackPages() {
  revalidatePath("/dashboard");
  revalidatePath("/opportunities");
  revalidatePath("/opportunities/[id]", "page");
}

/**
 * Thin Server Action wrapper shared by every feedback action below —
 * resolves the real session user, delegates validation to the
 * dependency-free `giveFeedbackForUser` (see feedback.ts), and upserts
 * (never inserts a duplicate) since the migration's unique constraint on
 * (user_id, opportunity_id, feedback_type) means a repeat click updates
 * the existing row in place.
 */
async function writeFeedback(opportunityId: string, input: FeedbackInput): Promise<FeedbackActionResult> {
  const user = await getAuthenticatedUser();
  const supabase = await createClient();

  const result = await giveFeedbackForUser(user?.id ?? null, opportunityId, input, async (userId, oppId, write) => {
    const { error } = await supabase.from("recommendation_feedback").upsert(
      {
        user_id: userId,
        opportunity_id: oppId,
        recommendation_id: write.recommendationId ?? null,
        feedback_type: write.feedbackType,
        reason: write.reason ?? null,
        reminder_at: write.reminderAt ?? null,
      },
      { onConflict: "user_id,opportunity_id,feedback_type" }
    );
    return { error: error?.message ?? null };
  });

  if (!result.success) return { error: result.error };
  revalidateFeedbackPages();
  return {};
}

/** "Not for me" — the only feedback type a reason is ever attached to. Also removes any prior positive feedback on the same opportunity, since a student can't simultaneously mean "more like this" and "not for me" about the same listing. */
export async function dismissOpportunity(
  opportunityId: string,
  reason: RecommendationFeedbackReason
): Promise<FeedbackActionResult> {
  const user = await getAuthenticatedUser();
  const supabase = await createClient();
  if (user) {
    await supabase
      .from("recommendation_feedback")
      .delete()
      .eq("user_id", user.id)
      .eq("opportunity_id", opportunityId)
      .eq("feedback_type", "more_like_this");
  }
  return writeFeedback(opportunityId, { feedbackType: "dismissed", reason });
}

export async function markMoreLikeThis(opportunityId: string): Promise<FeedbackActionResult> {
  return writeFeedback(opportunityId, { feedbackType: "more_like_this" });
}

export async function markHelpMeApply(opportunityId: string): Promise<FeedbackActionResult> {
  return writeFeedback(opportunityId, { feedbackType: "help_me_apply" });
}

/** Reminder time defaults to one month before the opportunity's own deadline (carrying its time-of-day, per the migration's comment) — falling back to 30 days out when no deadline is known, since "remind me" still needs a concrete time to fire. */
export async function remindMeLater(opportunityId: string): Promise<FeedbackActionResult> {
  const supabase = await createClient();
  const { data: opportunity } = await supabase
    .from("opportunities")
    .select("application_deadline")
    .eq("id", opportunityId)
    .maybeSingle();

  const ONE_MONTH_MS = 30 * 86_400_000;
  const reminderAt = opportunity?.application_deadline
    ? new Date(new Date(opportunity.application_deadline).getTime() - ONE_MONTH_MS)
    : new Date(Date.now() + ONE_MONTH_MS);

  return writeFeedback(opportunityId, { feedbackType: "remind_later", reminderAt: reminderAt.toISOString() });
}

/** Undo — removes the row outright rather than leaving a stale record, per the migration's own "never resurface unless explicitly reset" comment. */
export async function undoRecommendationFeedback(
  opportunityId: string,
  feedbackType: RecommendationFeedbackType
): Promise<FeedbackActionResult> {
  const user = await getAuthenticatedUser();
  const supabase = await createClient();

  const result = await removeFeedbackForUser(user?.id ?? null, opportunityId, feedbackType, async (userId, oppId, type) => {
    const { error } = await supabase
      .from("recommendation_feedback")
      .delete()
      .eq("user_id", userId)
      .eq("opportunity_id", oppId)
      .eq("feedback_type", type);
    return { error: error?.message ?? null };
  });

  if (!result.success) return { error: result.error };
  revalidateFeedbackPages();
  return {};
}

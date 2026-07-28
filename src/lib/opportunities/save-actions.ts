"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedUser } from "@/lib/auth/dal";
import { saveOpportunityForUser, unsaveOpportunityForUser } from "@/lib/opportunities/save";
import { createClient } from "@/lib/supabase/server";

export type SaveActionResult = { error?: string };

function revalidateOpportunityPages() {
  revalidatePath("/opportunities");
  revalidatePath("/opportunities/[id]", "page");
  revalidatePath("/saved");
  revalidatePath("/dashboard");
}

/**
 * Mirrors a save/unsave into `recommendation_feedback` as a `saved` row —
 * see that table's migration comment: "kept in sync with
 * saved_opportunities, not a second copy of that decision".
 * `saved_opportunities` stays the single source of truth for "is this
 * saved" (isSaved/getSavedOpportunityIds never read from here); this is
 * best-effort logging for ranking.ts/discovery-sources.ts only, so a
 * failure here is swallowed rather than turning a successful save into a
 * user-facing error.
 */
async function syncSavedFeedback(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  opportunityId: string,
  saved: boolean
): Promise<void> {
  const { error } = saved
    ? await supabase.from("recommendation_feedback").upsert(
        { user_id: userId, opportunity_id: opportunityId, feedback_type: "saved" },
        { onConflict: "user_id,opportunity_id,feedback_type", ignoreDuplicates: true }
      )
    : await supabase
        .from("recommendation_feedback")
        .delete()
        .eq("user_id", userId)
        .eq("opportunity_id", opportunityId)
        .eq("feedback_type", "saved");

  if (error) {
    console.error("[opportunities] failed to sync saved recommendation feedback:", error.message);
  }
}

/**
 * Thin Server Action wrappers: resolve the real session user and a real
 * Supabase client, then delegate to the dependency-free logic in
 * `save.ts` (see that file for why identity is never taken from the
 * caller). RLS on `saved_opportunities` (auth.uid() = user_id) is the
 * actual enforcement; resolving the user here first just turns an
 * unauthenticated call into a plain message instead of a raw RLS error.
 */
export async function saveOpportunity(opportunityId: string): Promise<SaveActionResult> {
  const user = await getAuthenticatedUser();
  const supabase = await createClient();

  const result = await saveOpportunityForUser(user?.id ?? null, opportunityId, async (userId, oppId) => {
    // Upsert + ignoreDuplicates: saving an already-saved opportunity (a
    // double click, or two tabs) is a no-op, not an error.
    const { error } = await supabase
      .from("saved_opportunities")
      .upsert(
        { user_id: userId, opportunity_id: oppId },
        { onConflict: "user_id,opportunity_id", ignoreDuplicates: true }
      );
    return { error: error?.message ?? null };
  });

  if (!result.success) return { error: result.error };
  if (user) await syncSavedFeedback(supabase, user.id, opportunityId, true);
  revalidateOpportunityPages();
  return {};
}

export async function unsaveOpportunity(opportunityId: string): Promise<SaveActionResult> {
  const user = await getAuthenticatedUser();
  const supabase = await createClient();

  const result = await unsaveOpportunityForUser(user?.id ?? null, opportunityId, async (userId, oppId) => {
    const { error } = await supabase
      .from("saved_opportunities")
      .delete()
      .eq("user_id", userId)
      .eq("opportunity_id", oppId);
    return { error: error?.message ?? null };
  });

  if (!result.success) return { error: result.error };
  if (user) await syncSavedFeedback(supabase, user.id, opportunityId, false);
  revalidateOpportunityPages();
  return {};
}

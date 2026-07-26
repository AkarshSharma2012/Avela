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
  revalidateOpportunityPages();
  return {};
}

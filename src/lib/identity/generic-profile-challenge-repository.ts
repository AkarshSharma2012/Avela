/**
 * Supabase access for portfolio_generic_profile_challenges — same shape as
 * identity/repository.ts's possession-challenge functions, kept in a
 * separate file (rather than added to that one) since this table is
 * provider-agnostic and portfolio-item-centric rather than GitHub-specific.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import type { GenericProfileChallenge } from "@/types/identity";

type Client = SupabaseClient<Database>;
type ChallengeInsert = Database["public"]["Tables"]["portfolio_generic_profile_challenges"]["Insert"];

export async function createGenericProfileChallenge(
  supabase: Client,
  userId: string,
  challenge: {
    portfolioItemId?: string | null;
    providerKey: string;
    targetUrl: string;
    tokenHash: string;
    expiresAt: string;
  }
): Promise<{ challenge: GenericProfileChallenge | null; error: string | null }> {
  const insert: ChallengeInsert = {
    user_id: userId,
    portfolio_item_id: challenge.portfolioItemId ?? null,
    provider_key: challenge.providerKey,
    target_url: challenge.targetUrl,
    challenge_token_hash: challenge.tokenHash,
    expires_at: challenge.expiresAt,
  };
  const { data, error } = await supabase.from("portfolio_generic_profile_challenges").insert(insert).select("*").single();
  if (error) return { challenge: null, error: error.message };
  return { challenge: data, error: null };
}

export async function getGenericProfileChallenge(supabase: Client, userId: string, challengeId: string): Promise<GenericProfileChallenge | null> {
  const { data, error } = await supabase
    .from("portfolio_generic_profile_challenges")
    .select("*")
    .eq("user_id", userId)
    .eq("id", challengeId)
    .maybeSingle();
  if (error) {
    console.error("[identity] failed to load generic profile challenge:", error.message);
    return null;
  }
  return data;
}

export async function markGenericProfileChallengeConfirmed(supabase: Client, userId: string, challengeId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("portfolio_generic_profile_challenges")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", challengeId);
  return { error: error?.message ?? null };
}

export async function markGenericProfileChallengeExpired(supabase: Client, userId: string, challengeId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("portfolio_generic_profile_challenges").update({ status: "expired" }).eq("user_id", userId).eq("id", challengeId);
  return { error: error?.message ?? null };
}

export async function revokeGenericProfileChallenge(supabase: Client, userId: string, challengeId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("portfolio_generic_profile_challenges").update({ status: "revoked" }).eq("user_id", userId).eq("id", challengeId);
  return { error: error?.message ?? null };
}

/** Per-user rate limit on challenge creation across every non-GitHub provider (spec section 9/10). */
export async function countRecentGenericProfileChallenges(supabase: Client, userId: string, sinceIso: string): Promise<number> {
  const { count, error } = await supabase
    .from("portfolio_generic_profile_challenges")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", sinceIso);
  if (error) {
    console.error("[identity] failed to count recent generic profile challenges:", error.message);
    return 0;
  }
  return count ?? 0;
}

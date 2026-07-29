import type { SupabaseClient } from "@supabase/supabase-js";

import { encryptIdentityToken } from "@/lib/identity/token-crypto";
import type { Database } from "@/types/database";
import type { ConnectedIdentity, ConnectedIdentitySummary, IdentityPossessionChallenge } from "@/types/identity";
import { toConnectedIdentitySummary } from "@/types/identity";

type Client = SupabaseClient<Database>;
type IdentityInsert = Database["public"]["Tables"]["connected_identities"]["Insert"];
type IdentityUpdate = Database["public"]["Tables"]["connected_identities"]["Update"];
type IdentityEventInsert = Database["public"]["Tables"]["connected_identity_events"]["Insert"];
type ChallengeInsert = Database["public"]["Tables"]["identity_possession_challenges"]["Insert"];

const IDENTITY_COLUMNS_WITHOUT_TOKEN =
  "id, user_id, provider, provider_subject, provider_username, provider_profile_url, display_name, avatar_url, granted_scopes, verified_at, last_checked_at, disconnected_at, metadata, created_at, updated_at";

/** Never selects access_token_ciphertext — every read path a UI could touch goes through this, not a raw `select("*")`. */
export async function getActiveConnectedIdentity(
  supabase: Client,
  userId: string,
  provider: "github"
): Promise<ConnectedIdentitySummary | null> {
  const { data, error } = await supabase
    .from("connected_identities")
    .select(IDENTITY_COLUMNS_WITHOUT_TOKEN)
    .eq("user_id", userId)
    .eq("provider", provider)
    .is("disconnected_at", null)
    .maybeSingle();

  if (error) {
    console.error("[identity] failed to load connected identity:", error.message);
    return null;
  }
  return data as ConnectedIdentitySummary | null;
}

/**
 * The only value the OSINT engine's ownership matching may treat as
 * identity-control credit (see src/lib/osint/actions.ts) — a typed
 * portfolio_items.github_username is never wired to this. Returns null for
 * a student with no active GitHub connection, exactly like today's
 * behavior for a student who typed nothing.
 */
export async function getActiveGithubUsernameForUser(supabase: Client, userId: string): Promise<string | null> {
  const identity = await getActiveConnectedIdentity(supabase, userId, "github");
  return identity?.provider_username ?? null;
}

export type ConnectResult =
  | { ok: true; identity: ConnectedIdentitySummary; wasReconnect: boolean }
  | { ok: false; reason: "already_linked_elsewhere" | "error"; message: string };

/**
 * Connects (or reconnects) a GitHub identity for this student. Race-safe
 * against the migration's two partial unique indexes: a 23505 on
 * (provider, provider_subject) means the account is already actively
 * linked to a *different* student (surfaced as already_linked_elsewhere,
 * never as a generic error, so the student gets an honest reason); a
 * 23505 on (user_id, provider) means this student already has an active
 * connection, which this function resolves as an update-in-place
 * (reconnect) rather than a second insert, so reconnecting the same or a
 * different account never creates duplicate trust (spec section 4).
 */
export async function connectGithubIdentity(
  supabase: Client,
  userId: string,
  profile: { subject: string; username: string; profileUrl: string; displayName: string | null; avatarUrl: string | null },
  accessToken: string | null,
  scopes: string[]
): Promise<ConnectResult> {
  const tokenCiphertext = accessToken ? encryptIdentityToken(accessToken) : null;

  const existing = await getActiveConnectedIdentity(supabase, userId, "github");

  if (existing) {
    const update: IdentityUpdate = {
      provider_subject: profile.subject,
      provider_username: profile.username,
      provider_profile_url: profile.profileUrl,
      display_name: profile.displayName,
      avatar_url: profile.avatarUrl,
      access_token_ciphertext: tokenCiphertext,
      granted_scopes: scopes,
      verified_at: new Date().toISOString(),
      last_checked_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("connected_identities").update(update).eq("id", existing.id).select(IDENTITY_COLUMNS_WITHOUT_TOKEN).single();
    if (error) {
      if (error.code === "23505") {
        return { ok: false, reason: "already_linked_elsewhere", message: "This GitHub account is already connected to another student." };
      }
      return { ok: false, reason: "error", message: error.message };
    }
    await logIdentityEvent(supabase, userId, data.id, "reconnected", "student");
    return { ok: true, identity: data as ConnectedIdentitySummary, wasReconnect: true };
  }

  const insert: IdentityInsert = {
    user_id: userId,
    provider: "github",
    provider_subject: profile.subject,
    provider_username: profile.username,
    provider_profile_url: profile.profileUrl,
    display_name: profile.displayName,
    avatar_url: profile.avatarUrl,
    access_token_ciphertext: tokenCiphertext,
    granted_scopes: scopes,
  };
  const { data, error } = await supabase.from("connected_identities").insert(insert).select(IDENTITY_COLUMNS_WITHOUT_TOKEN).single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, reason: "already_linked_elsewhere", message: "This GitHub account is already connected to another student." };
    }
    return { ok: false, reason: "error", message: error.message };
  }
  await logIdentityEvent(supabase, userId, data.id, "connected", "student");
  return { ok: true, identity: data as ConnectedIdentitySummary, wasReconnect: false };
}

export async function disconnectIdentity(supabase: Client, userId: string, identityId: string): Promise<{ error: string | null }> {
  const update: IdentityUpdate = { disconnected_at: new Date().toISOString() };
  const { error } = await supabase.from("connected_identities").update(update).eq("user_id", userId).eq("id", identityId);
  if (error) return { error: error.message };
  await logIdentityEvent(supabase, userId, identityId, "disconnected", "student");
  return { error: null };
}

export async function logIdentityEvent(
  supabase: Client,
  userId: string,
  identityId: string,
  eventType: IdentityEventInsert["event_type"],
  actorType: IdentityEventInsert["actor_type"],
  reason?: string
): Promise<{ error: string | null }> {
  const event: IdentityEventInsert = { user_id: userId, connected_identity_id: identityId, event_type: eventType, actor_type: actorType, reason: reason ?? null };
  const { error } = await supabase.from("connected_identity_events").insert(event);
  return { error: error?.message ?? null };
}

// --- Possession challenges ---------------------------------------------------

export async function createPossessionChallenge(
  supabase: Client,
  userId: string,
  challenge: {
    portfolioItemId?: string | null;
    provider: "github";
    targetIdentifier: string;
    challengeType: ChallengeInsert["challenge_type"];
    tokenHash: string;
    expiresAt: string;
  }
): Promise<{ challenge: IdentityPossessionChallenge | null; error: string | null }> {
  const insert: ChallengeInsert = {
    user_id: userId,
    portfolio_item_id: challenge.portfolioItemId ?? null,
    provider: challenge.provider,
    target_identifier: challenge.targetIdentifier,
    challenge_type: challenge.challengeType,
    challenge_token_hash: challenge.tokenHash,
    expires_at: challenge.expiresAt,
  };
  const { data, error } = await supabase.from("identity_possession_challenges").insert(insert).select("*").single();
  if (error) return { challenge: null, error: error.message };
  return { challenge: data, error: null };
}

export async function getPossessionChallenge(supabase: Client, userId: string, challengeId: string): Promise<IdentityPossessionChallenge | null> {
  const { data, error } = await supabase.from("identity_possession_challenges").select("*").eq("user_id", userId).eq("id", challengeId).maybeSingle();
  if (error) {
    console.error("[identity] failed to load possession challenge:", error.message);
    return null;
  }
  return data;
}

export async function markPossessionChallengeConfirmed(supabase: Client, userId: string, challengeId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("identity_possession_challenges")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", challengeId);
  return { error: error?.message ?? null };
}

export async function markPossessionChallengeExpired(supabase: Client, userId: string, challengeId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("identity_possession_challenges").update({ status: "expired" }).eq("user_id", userId).eq("id", challengeId);
  return { error: error?.message ?? null };
}

/** For a per-user rate limit on challenge creation (spec section 9: "Rate-limit server-side: ... proof-of-control challenges"). */
export async function countRecentPossessionChallenges(supabase: Client, userId: string, sinceIso: string): Promise<number> {
  const { count, error } = await supabase
    .from("identity_possession_challenges")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", sinceIso);
  if (error) {
    console.error("[identity] failed to count recent possession challenges:", error.message);
    return 0;
  }
  return count ?? 0;
}

export function identityRowToSummary(identity: ConnectedIdentity): ConnectedIdentitySummary {
  return toConnectedIdentitySummary(identity);
}

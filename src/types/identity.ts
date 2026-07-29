// Backed by public.connected_identities / public.connected_identity_events /
// public.identity_possession_challenges — see
// supabase/migrations/20260807000000_connected_identities.sql.

import type { Database } from "@/types/database";

export type {
  ConnectedIdentityEventActorType,
  ConnectedIdentityEventType,
  ConnectedIdentityProvider,
  PossessionChallengeStatus,
  PossessionChallengeType,
} from "@/types/database";

export type ConnectedIdentity = Database["public"]["Tables"]["connected_identities"]["Row"];

export type ConnectedIdentityEvent = Database["public"]["Tables"]["connected_identity_events"]["Row"];

export type IdentityPossessionChallenge = Database["public"]["Tables"]["identity_possession_challenges"]["Row"];

/** The provider-agnostic TIER-2 challenge (Milestone 10.8) — see supabase/migrations/20260816000000_generic_profile_challenges.sql. */
export type GenericProfileChallenge = Database["public"]["Tables"]["portfolio_generic_profile_challenges"]["Row"];

/** Never includes access_token_ciphertext — the shape every read path that could reach a Client Component should use instead of the full Row. */
export type ConnectedIdentitySummary = Omit<ConnectedIdentity, "access_token_ciphertext">;

export function toConnectedIdentitySummary(identity: ConnectedIdentity): ConnectedIdentitySummary {
  const summary: Partial<ConnectedIdentity> = { ...identity };
  delete summary.access_token_ciphertext;
  return summary as ConnectedIdentitySummary;
}

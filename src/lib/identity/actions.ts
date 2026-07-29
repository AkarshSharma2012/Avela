"use server";

/**
 * Student-facing entry points into the connected-identity flow (spec
 * section 4). Mirrors verification/actions.ts's shape: student actions run
 * on the caller's own session client; the one cross-cutting effect that
 * needs a 'system' actor_type (downgrading claim dimensions on disconnect,
 * confirming a possession challenge) uses a service-role client the same
 * defensive way verification/actions.ts does.
 *
 * Every function here degrades gracefully when GitHub OAuth isn't
 * configured (no real GitHub OAuth App exists in this environment) — never
 * throws an unhandled error into the UI, always returns a plain-language
 * `error` string instead.
 */

import { revalidatePath } from "next/cache";

import { getAuthenticatedUser } from "@/lib/auth/dal";
import { applyDimensionTransition, createClaimsServiceRoleClient, ensureDimensionRow, listDimensionsForUser, markDimensionStale, studentUpdateDimension } from "@/lib/claims/repository";
import { MAX_POSSESSION_CHALLENGES_PER_WINDOW, POSSESSION_CHALLENGE_RATE_WINDOW_SECONDS } from "@/lib/identity/constants";
import { fetchGithubAuthenticatedUser, isGithubOauthConfigured, listGithubUserRepositories, type GithubOauthRepo } from "@/lib/identity/github-oauth";
import { generatePossessionChallenge, verifyPossessionChallenge } from "@/lib/identity/possession-challenge";
import * as identityRepo from "@/lib/identity/repository";
import { decryptIdentityToken } from "@/lib/identity/token-crypto";
import * as portfolioRepo from "@/lib/portfolio/repository";
import { createClient } from "@/lib/supabase/server";
import type { ClaimDimensionEvidenceRef } from "@/types/claims";
import type { ConnectedIdentitySummary, PossessionChallengeType } from "@/types/identity";

export type IdentityActionResult = { error?: string };

// --- Reads --------------------------------------------------------------

export async function getMyConnectedGithubIdentity(): Promise<{ identity: ConnectedIdentitySummary | null; error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { identity: null, error: "You need to be signed in." };

  const supabase = await createClient();
  return { identity: await identityRepo.getActiveConnectedIdentity(supabase, user.id, "github") };
}

export async function listMyGithubRepositories(): Promise<{ repos: GithubOauthRepo[]; error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { repos: [], error: "You need to be signed in." };

  const supabase = await createClient();
  const identity = await identityRepo.getActiveConnectedIdentity(supabase, user.id, "github");
  if (!identity) return { repos: [], error: "Connect your GitHub account first." };

  // access_token_ciphertext is never selected by getActiveConnectedIdentity
  // (it returns ConnectedIdentitySummary) — re-fetch it directly here, the
  // one place in this module allowed to see it, and never log or return it.
  const { data: withToken, error } = await supabase
    .from("connected_identities")
    .select("access_token_ciphertext")
    .eq("id", identity.id)
    .single();
  if (error || !withToken?.access_token_ciphertext) {
    return { repos: [], error: "This GitHub connection needs to be reconnected." };
  }

  let accessToken: string;
  try {
    accessToken = decryptIdentityToken(withToken.access_token_ciphertext);
  } catch {
    return { repos: [], error: "This GitHub connection needs to be reconnected." };
  }

  const result = await listGithubUserRepositories(accessToken);
  if (!result.ok) return { repos: [], error: result.reason };
  return { repos: result.repos };
}

// --- Connect completion (called by the OAuth callback route handler) -------

export type CompleteConnectResult = { ok: true; identity: ConnectedIdentitySummary } | { ok: false; error: string };

export async function completeGithubConnect(accessToken: string, scopes: string[]): Promise<CompleteConnectResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  const profileResult = await fetchGithubAuthenticatedUser(accessToken);
  if (!profileResult.ok) return { ok: false, error: profileResult.reason };

  const supabase = await createClient();
  const result = await identityRepo.connectGithubIdentity(
    supabase,
    user.id,
    {
      subject: String(profileResult.user.id),
      username: profileResult.user.login,
      profileUrl: profileResult.user.htmlUrl,
      displayName: profileResult.user.name,
      avatarUrl: profileResult.user.avatarUrl,
    },
    accessToken,
    scopes
  );

  if (!result.ok) return { ok: false, error: result.message };

  revalidatePath("/portfolio");
  return { ok: true, identity: result.identity };
}

// --- Repository selection & role confirmation ------------------------------

export async function selectGithubRepositoryForItem(
  itemId: string,
  repoFullName: string,
  role: string | null
): Promise<IdentityActionResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in." };

  const supabase = await createClient();
  const item = await portfolioRepo.getPortfolioItem(supabase, user.id, itemId);
  if (!item) return { error: "Couldn't find that portfolio item." };

  const identity = await identityRepo.getActiveConnectedIdentity(supabase, user.id, "github");
  if (!identity) return { error: "Connect your GitHub account to confirm control." };

  // Never trust a client-supplied repoFullName on its own — it must be one
  // of *this* connected account's own repositories, re-verified server-side
  // against the GitHub API on every call, not just checked against
  // whatever the picker showed on screen a moment ago.
  const { repos, error: listError } = await listMyGithubRepositories();
  if (listError) return { error: listError };
  const repo = repos.find((r) => r.fullName.toLowerCase() === repoFullName.toLowerCase());
  if (!repo) return { error: "That repository wasn't found among this account's own repositories." };

  const evidenceRef: ClaimDimensionEvidenceRef = { connected_identity_id: identity.id };
  const dimensionsToUpdate = ["identity_control", "account_or_asset_control"] as const;
  for (const dimension of dimensionsToUpdate) {
    const { result: dimensionRow, error } = await ensureDimensionRow(supabase, user.id, itemId, dimension);
    if (error || !dimensionRow) continue;
    await studentUpdateDimension(supabase, user.id, dimensionRow, {
      evidenceRef: { ...evidenceRef, repo: repoFullName } as unknown as Record<string, unknown>,
      reason: repo.isFork ? "Connected repository is a fork of another project." : undefined,
    });
  }

  if (role && role.trim()) {
    const { result: roleRow } = await ensureDimensionRow(supabase, user.id, itemId, "role");
    if (roleRow) {
      await studentUpdateDimension(supabase, user.id, roleRow, {
        evidenceRef: { connected_identity_id: identity.id } as unknown as Record<string, unknown>,
      });
    }
  }

  await identityRepo.logIdentityEvent(supabase, user.id, identity.id, "repository_selected", "student", repoFullName);
  if (role && role.trim()) {
    await identityRepo.logIdentityEvent(supabase, user.id, identity.id, "role_confirmed", "student", role.trim().slice(0, 200));
  }

  revalidatePath(`/portfolio/items/${itemId}`);
  return {};
}

// --- Disconnect --------------------------------------------------------------

export async function disconnectMyGithubIdentity(): Promise<IdentityActionResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in." };

  const supabase = await createClient();
  const identity = await identityRepo.getActiveConnectedIdentity(supabase, user.id, "github");
  if (!identity) return { error: "No GitHub account is connected." };

  const { error } = await identityRepo.disconnectIdentity(supabase, user.id, identity.id);
  if (error) return { error: "Couldn't disconnect right now. Please try again." };

  await downgradeDimensionsForDisconnectedIdentity(user.id, identity.id);

  revalidatePath("/portfolio");
  return {};
}

/**
 * Spec section 4: "disconnecting an identity downgrades dependent claim
 * dimensions." Any dimension whose evidence_ref points at this identity is
 * marked stale, and any that had reached strongly_supported or
 * externally_confirmed on the strength of that connection is stepped back
 * to unable_to_verify — the trust that identity provided no longer holds
 * once the connection is gone. Uses the service-role client because the
 * audit event this writes is actor_type='system', which client-session RLS
 * deliberately never allows (see the migration's insert policy).
 */
async function downgradeDimensionsForDisconnectedIdentity(userId: string, identityId: string): Promise<void> {
  const supabase = await createClient();
  const byItem = await listDimensionsForUser(supabase, userId);
  const affected = [...byItem.values()].flat().filter((row) => {
    const ref = row.evidence_ref as ClaimDimensionEvidenceRef | null;
    return ref?.connected_identity_id === identityId;
  });
  if (affected.length === 0) return;

  const serviceClient = createClaimsServiceRoleClient();
  for (const row of affected) {
    const reason = "The connected account this was based on was disconnected.";
    if (row.status === "strongly_supported" || row.status === "externally_confirmed") {
      await applyDimensionTransition(serviceClient, row, { status: "unable_to_verify", actorType: "system", reason, stale: true });
    } else {
      await markDimensionStale(serviceClient, row, reason);
    }
  }
}

// --- Possession-challenge fallback (spec section 4) --------------------------

export type RequestPossessionChallengeResult = { rawToken: string; challengeId: string; expiresAt: string } | { error: string };

export async function requestGithubPossessionChallenge(
  itemId: string | null,
  challengeType: PossessionChallengeType
): Promise<RequestPossessionChallengeResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in." };

  const supabase = await createClient();
  if (itemId) {
    const item = await portfolioRepo.getPortfolioItem(supabase, user.id, itemId);
    if (!item) return { error: "Couldn't find that portfolio item." };
  }

  const since = new Date(Date.now() - POSSESSION_CHALLENGE_RATE_WINDOW_SECONDS * 1000).toISOString();
  const recentCount = await identityRepo.countRecentPossessionChallenges(supabase, user.id, since);
  if (recentCount >= MAX_POSSESSION_CHALLENGES_PER_WINDOW) {
    return { error: "You've reached the limit for this request type — try again later." };
  }

  const { rawToken, tokenHash, expiresAt } = generatePossessionChallenge();
  const { challenge, error } = await identityRepo.createPossessionChallenge(supabase, user.id, {
    portfolioItemId: itemId,
    provider: "github",
    targetIdentifier: "https://pending.invalid/", // placeholder until confirmGithubPossessionChallenge is called with the real URL — see below.
    challengeType,
    tokenHash,
    expiresAt,
  });
  if (error || !challenge) return { error: "Couldn't start that check right now. Please try again." };

  return { rawToken, challengeId: challenge.id, expiresAt };
}

export async function confirmGithubPossessionChallenge(challengeId: string, presentedToken: string, targetUrl: string): Promise<IdentityActionResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in." };
  if (!targetUrl.startsWith("https://")) return { error: "That link needs to use a secure (https://) address." };

  const supabase = await createClient();
  const challenge = await identityRepo.getPossessionChallenge(supabase, user.id, challengeId);
  if (!challenge || challenge.status !== "pending") return { error: "This check is no longer available." };

  const result = await verifyPossessionChallenge(
    { tokenHash: challenge.challenge_token_hash, expiresAt: challenge.expires_at },
    presentedToken,
    targetUrl
  );
  if (!result.ok) {
    if (result.reason === "expired") await identityRepo.markPossessionChallengeExpired(supabase, user.id, challengeId);
    return { error: "We couldn't confirm that yet. You can still add evidence instead." };
  }

  await supabase.from("identity_possession_challenges").update({ target_identifier: targetUrl }).eq("id", challengeId).eq("user_id", user.id);
  await identityRepo.markPossessionChallengeConfirmed(supabase, user.id, challengeId);

  if (challenge.portfolio_item_id) {
    const { result: dimensionRow } = await ensureDimensionRow(supabase, user.id, challenge.portfolio_item_id, "account_or_asset_control");
    if (dimensionRow) {
      const serviceClient = createClaimsServiceRoleClient();
      await applyDimensionTransition(serviceClient, dimensionRow, {
        status: "strongly_supported",
        actorType: "system",
        reason: "Confirmed by placing a one-time code at the claimed location.",
        evidenceRef: { field_confirmation_id: challengeId },
      });
    }
  }

  revalidatePath("/portfolio");
  return {};
}

/** async because this lives in a "use server" file — every export here becomes a Server Action, and Next.js requires each one to be async regardless of whether it awaits anything. */
export async function isGithubConnectAvailable(): Promise<boolean> {
  return isGithubOauthConfigured();
}

/**
 * Generic (any-provider) public-profile control challenge (spec section
 * 10). Reuses generatePossessionChallenge/verifyPossessionChallenge
 * (possession-challenge.ts) exactly as-is — that module was already
 * provider-agnostic (it takes any targetUrl and safe-fetches it) — rather
 * than reimplementing the same hash-only-token generate/compare logic a
 * second time. This module only adds the two things the generic flow needs
 * on top: an HTTPS-only pre-check (stricter than safe-fetch.ts's general
 * http-or-https allowance, per spec section 10) and provider-tier
 * validation against the registry, so a student can never start a
 * "connect" challenge for a provider that isn't actually registered at the
 * proof_of_control tier.
 */

import { generatePossessionChallenge, verifyPossessionChallenge, type PossessionCheckResult } from "@/lib/identity/possession-challenge";
import { findProvider, isProviderAvailable } from "@/lib/identity/provider-availability";

export type GenericProfileChallengeValidationResult = { valid: true } | { valid: false; error: string };

/** Never allows starting a challenge for a provider the registry doesn't mark as proof-of-control-capable and currently available. */
export function validateProviderForGenericChallenge(providerKey: string): GenericProfileChallengeValidationResult {
  const provider = findProvider(providerKey);
  if (!provider) return { valid: false, error: "That provider isn't available yet. You can add a public link instead." };
  if (provider.tier !== "proof_of_control") {
    return { valid: false, error: "That provider isn't available yet. You can add a public link instead." };
  }
  if (!isProviderAvailable(provider)) {
    return { valid: false, error: "That provider isn't available yet. You can add a public link instead." };
  }
  return { valid: true };
}

/** HTTPS-only per spec section 10 — a stricter rule than safe-fetch.ts's general http-or-https allowance for OSINT connectors. */
export function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export function validateGenericChallengeTargetUrl(url: string): GenericProfileChallengeValidationResult {
  if (!isHttpsUrl(url)) return { valid: false, error: "That link needs to use a secure (https://) address." };
  return { valid: true };
}

/** Same 24-hour TTL as the GitHub possession-challenge fallback (GENERIC_PROFILE_CHALLENGE_TTL_SECONDS mirrors POSSESSION_CHALLENGE_TTL_SECONDS) — reuses generatePossessionChallenge()'s own expiresAt rather than computing a second, independently-drifting one. */
export function generateGenericProfileChallenge(): { rawToken: string; tokenHash: string; expiresAt: string } {
  return generatePossessionChallenge();
}

export type GenericProfileCheckResult = PossessionCheckResult;

/** Delegates entirely to verifyPossessionChallenge — the underlying safeFetch/hash-compare logic is identical; only the caller-supplied targetUrl differs from the GitHub-derived one. */
export async function verifyGenericProfileChallenge(
  challenge: { tokenHash: string; expiresAt: string },
  presentedToken: string,
  targetUrl: string
): Promise<GenericProfileCheckResult> {
  return verifyPossessionChallenge(challenge, presentedToken, targetUrl);
}

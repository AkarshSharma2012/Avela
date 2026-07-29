/**
 * The OAuth-unavailable fallback control-proof (spec section 4): a
 * short-lived random string the student places in a public repo file,
 * gist, issue, or deployment endpoint, verified server-side by fetching
 * that public location and confirming the string is actually there.
 *
 * Only the *hash* of the challenge is ever persisted
 * (identity_possession_challenges.challenge_token_hash) — the same
 * present-then-hash-and-compare shape as verification/tokens.ts's one-time
 * links, reused directly here rather than reimplemented. The raw string is
 * shown to the student once (by the caller, e.g. a Server Action's return
 * value) and never written to a database row.
 *
 * This proves possession of the target only — never authorship, never
 * impact, and (per spec) never requires a face or location to be visible
 * in anything the student places.
 */

import { generateVerificationToken, hashVerificationToken, hashesMatch, isTokenExpired } from "@/lib/verification/tokens";
import { safeFetch } from "@/lib/osint/safe-fetch";

const CHALLENGE_PREFIX = "avela-verify-";
export const POSSESSION_CHALLENGE_TTL_SECONDS = 60 * 60 * 24; // 24 hours — short-lived per spec.

export function generatePossessionChallenge(): { rawToken: string; tokenHash: string; expiresAt: string } {
  const rawToken = `${CHALLENGE_PREFIX}${generateVerificationToken()}`;
  return {
    rawToken,
    tokenHash: hashVerificationToken(rawToken),
    expiresAt: new Date(Date.now() + POSSESSION_CHALLENGE_TTL_SECONDS * 1000).toISOString(),
  };
}

export type PossessionCheckResult =
  | { ok: true }
  | { ok: false; reason: "expired" | "token_mismatch" | "not_found_at_target" | "fetch_failed" };

/**
 * `presentedToken` is whatever the student's own client re-submits (the
 * same value it displayed after generatePossessionChallenge) — never
 * retyped from the target page itself, so a wrong target can never
 * accidentally "confirm" a stale/unrelated challenge.
 */
export async function verifyPossessionChallenge(
  challenge: { tokenHash: string; expiresAt: string },
  presentedToken: string,
  targetUrl: string
): Promise<PossessionCheckResult> {
  if (isTokenExpired(challenge.expiresAt)) return { ok: false, reason: "expired" };
  if (!hashesMatch(hashVerificationToken(presentedToken), challenge.tokenHash)) {
    return { ok: false, reason: "token_mismatch" };
  }

  const fetched = await safeFetch(targetUrl, { skipRobotsCheck: true });
  if (fetched.status !== "ok") return { ok: false, reason: "fetch_failed" };
  if (!fetched.body.includes(presentedToken)) return { ok: false, reason: "not_found_at_target" };

  return { ok: true };
}

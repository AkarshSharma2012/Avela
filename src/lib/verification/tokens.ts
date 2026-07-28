/**
 * One-time verification-link tokens. The raw token is what goes in the
 * emailed link and is never persisted anywhere; only its sha256 hash is
 * stored (portfolio_verifications.verification_code_hash), and every
 * lookup re-hashes whatever the visitor presents and compares in constant
 * time — see docs/security.md (Milestone 10.5).
 */

import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

import { VERIFICATION_LINK_EXPIRY_SECONDS } from "@/lib/verification/constants";

const TOKEN_BYTES = 32;

/** Cryptographically secure, URL-safe — never Math.random or any other non-CSPRNG source. */
export function generateVerificationToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashVerificationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/** Constant-time comparison of two hex digests — guards against a timing side-channel on the lookup, even though the lookup itself is by-hash (not by raw token). */
export function hashesMatch(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "hex");
  const bufferB = Buffer.from(b, "hex");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export function computeVerificationExpiry(now: Date = new Date(), ttlSeconds: number = VERIFICATION_LINK_EXPIRY_SECONDS): Date {
  return new Date(now.getTime() + ttlSeconds * 1000);
}

/** A null expiry is never treated as "still valid" — every verification link must have an expiry, and a missing one fails closed. */
export function isTokenExpired(expiresAt: string | null, now: Date = new Date()): boolean {
  if (expiresAt === null) return true;
  const expiryTime = new Date(expiresAt).getTime();
  if (Number.isNaN(expiryTime)) return true;
  return expiryTime <= now.getTime();
}

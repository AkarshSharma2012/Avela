/**
 * DB-backed, fixed-window rate limiting (spec section 9) — a proper
 * successor to the in-memory limiter in osint/rate-limit.ts, which is
 * process-local and inadequate for security-relevant limits like connect
 * attempts, possession challenges, or reviewer decisions (a restart, or a
 * second server instance, would silently reset it). That in-memory limiter
 * keeps its original job — pacing outbound HTTP requests to third-party
 * domains during a check — and is untouched by this module.
 *
 * The actual increment happens inside increment_rate_limit_counter(), a
 * Postgres function that resolves the caller's identity via auth.uid()
 * itself (see the migration) — so this runs on the student's own session
 * client, no service-role client needed, and a student can only ever
 * increment their own counter.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, RateLimitBucket } from "@/types/database";

type Client = SupabaseClient<Database>;

export const RATE_LIMITS: Record<RateLimitBucket, { windowSeconds: number; max: number }> = {
  verification_request: { windowSeconds: 60 * 60 * 24, max: 5 },
  verification_resend: { windowSeconds: 60 * 60 * 24, max: 3 },
  verifier_response: { windowSeconds: 60 * 60, max: 10 },
  osint_check: { windowSeconds: 60 * 60, max: 10 },
  connect_attempt: { windowSeconds: 60 * 60, max: 10 },
  possession_challenge: { windowSeconds: 60 * 60, max: 5 },
  reviewer_decision: { windowSeconds: 60 * 60, max: 100 },
};

/** Truncates "now" to the start of its fixed window — every request in the same window shares one counter row. */
export function currentWindowStart(bucket: RateLimitBucket, now: Date = new Date()): string {
  const windowMs = RATE_LIMITS[bucket].windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs).toISOString();
}

export type RateLimitResult = { allowed: boolean; count: number; max: number };

/**
 * Always increments — a fixed-window counter "spends" the attempt whether
 * or not it turns out to be over the limit, which is the standard,
 * simplest-to-reason-about behavior for this shape of limiter. Fails open
 * on an unexpected database error (logged, never thrown into the caller)
 * so a rate-limiter outage can never itself block every student action —
 * the caller still applies its own business-rule checks independently.
 */
export async function checkAndIncrementRateLimit(supabase: Client, bucket: RateLimitBucket, now: Date = new Date()): Promise<RateLimitResult> {
  const limit = RATE_LIMITS[bucket];
  const windowStart = currentWindowStart(bucket, now);

  const { data, error } = await supabase.rpc("increment_rate_limit_counter", { p_bucket: bucket, p_window_start: windowStart });
  if (error || data === null) {
    console.error("[integrity] rate limit check failed, failing open:", error?.message);
    return { allowed: true, count: 0, max: limit.max };
  }

  return { allowed: data <= limit.max, count: data, max: limit.max };
}

/**
 * For actors with no Avela session at all (a verifier acting through a
 * one-time link) — keyed to the *claim's owning student* instead, and only
 * ever callable from a service-role connection (see the migration's grant,
 * restricted to the service_role Postgres role). Same fail-open behavior on
 * an unexpected error.
 */
export async function checkAndIncrementRateLimitForUser(serviceClient: Client, userId: string, bucket: RateLimitBucket, now: Date = new Date()): Promise<RateLimitResult> {
  const limit = RATE_LIMITS[bucket];
  const windowStart = currentWindowStart(bucket, now);

  const { data, error } = await serviceClient.rpc("increment_rate_limit_counter_for_user", { p_user_id: userId, p_bucket: bucket, p_window_start: windowStart });
  if (error || data === null) {
    console.error("[integrity] rate limit check failed, failing open:", error?.message);
    return { allowed: true, count: 0, max: limit.max };
  }

  return { allowed: data <= limit.max, count: data, max: limit.max };
}

/**
 * Milestone 10.10A security audit — review-link creation, confirmation-
 * request creation, and portfolio file uploads had no rate limit at all
 * (unbounded, client-reachable, DB/storage-growth cost). This proves the
 * fix end-to-end against a real database: the new bucket values are
 * actually accepted by rate_limit_counters' check constraint, and the
 * configured max is actually enforced by increment_rate_limit_counter(),
 * not just present in the RATE_LIMITS config object. Runs against the
 * isolated local Supabase instance only; skips itself otherwise — same
 * pattern as tests/review-links/expiry-integration.test.ts.
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { checkAndIncrementRateLimit, RATE_LIMITS } from "@/lib/integrity/rate-limit";
import type { Database } from "@/types/database";

function isLoopbackSupabaseUrlConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  try {
    const hostname = new URL(url).hostname;
    return hostname === "127.0.0.1" || hostname === "localhost";
  } catch {
    return false;
  }
}

const isolated = isLoopbackSupabaseUrlConfigured();
const maybeDescribe = isolated ? describe : describe.skip;

maybeDescribe("new rate-limit buckets — real local Supabase", () => {
  // Deliberately created inside beforeAll, not here — describe.skip still
  // *executes* this callback body to collect its it() blocks (it only
  // skips running them), so any client construction directly in the body
  // would throw on a plain `npm test` run where these env vars are unset.
  let admin: ReturnType<typeof createClient<Database>>;
  let userId: string;
  let sessionClient: ReturnType<typeof createClient<Database>>;

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    admin = createClient<Database>(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const email = `e2e+ratelimit-${randomUUID().slice(0, 8)}@e2e.avela.invalid`;
    const password = randomUUID();
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`failed to create test user: ${error?.message}`);
    userId = data.user.id;

    sessionClient = createClient<Database>(url, anonKey);
    const { error: signInError } = await sessionClient.auth.signInWithPassword({ email, password });
    if (signInError) throw new Error(`failed to sign in test user: ${signInError.message}`);
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from("rate_limit_counters").delete().eq("user_id", userId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("review_link_create is accepted by the DB and enforces its configured max", async () => {
    const max = RATE_LIMITS.review_link_create.max;
    let lastResult;
    for (let i = 0; i < max; i++) {
      lastResult = await checkAndIncrementRateLimit(sessionClient, "review_link_create");
      expect(lastResult.allowed).toBe(true);
    }
    // One more, over the configured max, must be rejected.
    const overLimit = await checkAndIncrementRateLimit(sessionClient, "review_link_create");
    expect(overLimit.allowed).toBe(false);
    expect(overLimit.count).toBe(max + 1);
  });

  it("confirmation_request_create and portfolio_file_upload buckets are also accepted by the DB", async () => {
    const confirmation = await checkAndIncrementRateLimit(sessionClient, "confirmation_request_create");
    expect(confirmation.allowed).toBe(true);

    const upload = await checkAndIncrementRateLimit(sessionClient, "portfolio_file_upload");
    expect(upload.allowed).toBe(true);
  });
});

/**
 * A dedicated user/describe block — not sharing a counter with the
 * sequential tests above — so a burst of genuinely concurrent requests
 * (fired via Promise.all, not a for-loop) can assert the boundary exactly.
 * Directly verifies the atomic insert...on conflict...do update primitive
 * (Milestone 10.7) can't be raced past its configured max, not just that
 * sequential calls respect it.
 */
maybeDescribe("new rate-limit buckets — concurrent boundary", () => {
  let admin: ReturnType<typeof createClient<Database>>;
  let userId: string;
  let sessionClient: ReturnType<typeof createClient<Database>>;

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    admin = createClient<Database>(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const email = `e2e+ratelimit-burst-${randomUUID().slice(0, 8)}@e2e.avela.invalid`;
    const password = randomUUID();
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`failed to create test user: ${error?.message}`);
    userId = data.user.id;

    sessionClient = createClient<Database>(url, anonKey);
    const { error: signInError } = await sessionClient.auth.signInWithPassword({ email, password });
    if (signInError) throw new Error(`failed to sign in test user: ${signInError.message}`);
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from("rate_limit_counters").delete().eq("user_id", userId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it(
    "a burst of concurrent portfolio_file_upload checks never allows more than the configured max",
    async () => {
      const max = RATE_LIMITS.portfolio_file_upload.max;
      const burstSize = max + 10;

      const results = await Promise.all(
        Array.from({ length: burstSize }, () => checkAndIncrementRateLimit(sessionClient, "portfolio_file_upload"))
      );

      const allowedCount = results.filter((r) => r.allowed).length;
      expect(allowedCount).toBe(max);

      // Every one of the burstSize attempts still incremented the counter —
      // "always increments" (see rate-limit.ts's own doc comment) — so the
      // final count in the DB must equal the full burst size, not just the
      // allowed count, and no two concurrent callers can have read/written
      // the same pre-increment value (which would under-count).
      const counts = results.map((r) => r.count).sort((a, b) => a - b);
      expect(counts).toEqual(Array.from({ length: burstSize }, (_, i) => i + 1));
    },
    // 60 real concurrent network round trips to local Supabase — the
    // default 5s Vitest test timeout is too tight under load; this is a
    // slow-but-correct integration test, not a hang.
    15_000
  );
});

if (!isolated) {
  describe("new rate-limit buckets", () => {
    it.skip("skipped — no isolated E2E_SUPABASE_* backend configured in this run", () => {});
  });
}

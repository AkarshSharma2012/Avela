/**
 * Milestone 10.10B2A — regression coverage for the confirmed B1 audit
 * defect: resolveVerifierClaim() (backing confirmVerifierClaim,
 * declineVerifierClaim, requestCorrectionFromVerifier) used to call
 * revalidatePath() twice after resolving a verifier's claim. Next.js's
 * revalidatePath()/revalidate() sets the *current* Server Action's
 * `pathWasRevalidated` flag unconditionally — see
 * node_modules/next/dist/server/web/spec-extension/revalidate.js — which
 * forces the client to refetch whatever route actually invoked the action
 * (here, /verify/[token]) regardless of which paths were named. Because the
 * token had just been single-use-consumed, that forced refetch made the
 * page's own "no claim found" branch overwrite the verifier's success
 * message with "This verification link isn't valid, or has already been
 * used" — for every verifier, immediately after a successful response.
 *
 * revalidatePath() also throws outside of an active Next.js request/Server
 * Action context ("Invariant: static generation store missing in
 * revalidatePath ...") — which is exactly this Vitest process. That gives a
 * simple, deterministic pin for the fix: calling these actions directly
 * here must never throw that invariant, because resolveVerifierClaim must
 * no longer call revalidatePath at all.
 *
 * Runs against the isolated local Supabase instance only; skips itself
 * otherwise — same pattern as tests/review-links/expiry-integration.test.ts
 * and tests/integrity/rate-limit-new-buckets-integration.test.ts.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateVerificationToken, hashVerificationToken, computeVerificationExpiry } from "@/lib/verification/tokens";

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

maybeDescribe("resolveVerifierClaim — real local Supabase", () => {
  let serviceClient: ReturnType<typeof import("@/lib/verification/repository").createVerificationServiceRoleClient>;
  let userId: string;
  const createdItemIds: string[] = [];

  beforeAll(async () => {
    const { createVerificationServiceRoleClient } = await import("@/lib/verification/repository");
    serviceClient = createVerificationServiceRoleClient();

    const { data: authUser, error } = await serviceClient.auth.admin.createUser({
      email: `e2e+verifier-claim-${randomUUID().slice(0, 8)}@e2e.avela.invalid`,
      password: randomUUID(),
      email_confirm: true,
    });
    if (error || !authUser.user) throw new Error(`failed to create test user: ${error?.message}`);
    userId = authUser.user.id;
  });

  afterAll(async () => {
    if (createdItemIds.length > 0) {
      await serviceClient.from("portfolio_verifications").delete().in("portfolio_item_id", createdItemIds);
      await serviceClient.from("portfolio_verification_events").delete().in("portfolio_item_id", createdItemIds);
      await serviceClient.from("portfolio_items").delete().in("id", createdItemIds);
    }
    if (userId) await serviceClient.auth.admin.deleteUser(userId);
  });

  async function seedClaim(): Promise<{ rawToken: string; itemId: string }> {
    const { data: item, error: itemError } = await serviceClient
      .from("portfolio_items")
      .insert({ user_id: userId, item_type: "award", title: "[E2E TEST] verifier claim resolution" })
      .select("id")
      .single();
    if (itemError || !item) throw new Error(`failed to insert test item: ${itemError?.message}`);
    createdItemIds.push(item.id);

    const rawToken = generateVerificationToken();
    const tokenHash = hashVerificationToken(rawToken);
    const { error: verificationError } = await serviceClient.from("portfolio_verifications").insert({
      user_id: userId,
      portfolio_item_id: item.id,
      verification_level: "evidence_added",
      verification_code_hash: tokenHash,
      requested_at: new Date().toISOString(),
      expires_at: computeVerificationExpiry(new Date()).toISOString(),
    });
    if (verificationError) throw new Error(`failed to insert test verification: ${verificationError.message}`);

    return { rawToken, itemId: item.id };
  }

  it("confirming a claim never throws the 'static generation store missing' invariant that a stray revalidatePath() call would raise outside a Server Action", async () => {
    const { confirmVerifierClaim } = await import("@/lib/verification/actions");
    const { rawToken } = await seedClaim();

    await expect(confirmVerifierClaim(rawToken)).resolves.toEqual({});
  });

  it("a first successful confirmation records exactly one response, consumes the token, and getVerifierClaim() then reports it as no-longer-valid — the safe post-success state", async () => {
    const { confirmVerifierClaim, getVerifierClaim } = await import("@/lib/verification/actions");
    const { rawToken, itemId } = await seedClaim();

    const result = await confirmVerifierClaim(rawToken);
    expect(result).toEqual({});

    const { data: verification } = await serviceClient
      .from("portfolio_verifications")
      .select("*")
      .eq("portfolio_item_id", itemId)
      .single();
    expect(verification?.verification_level).toBe("externally_confirmed");
    expect(verification?.verification_code_hash).toBeNull();
    expect(verification?.verified_at).not.toBeNull();

    const { data: events } = await serviceClient
      .from("portfolio_verification_events")
      .select("*")
      .eq("portfolio_item_id", itemId)
      .eq("event_type", "verification_confirmed");
    expect(events).toHaveLength(1);

    // Single-use: the same (now-consumed) token is safely rejected, not
    // silently treated as still-open.
    const revisit = await getVerifierClaim(rawToken);
    expect(revisit.claim).toBeNull();
    expect(revisit.error).toBe("This verification link isn't valid, or has already been used.");
  });

  it("a second confirmation attempt on an already-used token is rejected and never records a second event", async () => {
    const { confirmVerifierClaim } = await import("@/lib/verification/actions");
    const { rawToken, itemId } = await seedClaim();

    await confirmVerifierClaim(rawToken);
    const second = await confirmVerifierClaim(rawToken);
    expect(second.error).toBeTruthy();

    const { data: events } = await serviceClient
      .from("portfolio_verification_events")
      .select("*")
      .eq("portfolio_item_id", itemId)
      .eq("event_type", "verification_confirmed");
    expect(events).toHaveLength(1);
  });

  it("declining and requesting a correction also resolve without throwing and consume the token exactly once each", async () => {
    const { declineVerifierClaim, requestCorrectionFromVerifier, getVerifierClaim } = await import("@/lib/verification/actions");

    const declineSeed = await seedClaim();
    await expect(declineVerifierClaim(declineSeed.rawToken)).resolves.toEqual({});
    expect((await getVerifierClaim(declineSeed.rawToken)).claim).toBeNull();

    const correctionSeed = await seedClaim();
    await expect(requestCorrectionFromVerifier(correctionSeed.rawToken, "The dates are off by a month.")).resolves.toEqual({});
    expect((await getVerifierClaim(correctionSeed.rawToken)).claim).toBeNull();
  });

  it("an expired token is rejected before any resolution is attempted, and is never consumed", async () => {
    const { confirmVerifierClaim } = await import("@/lib/verification/actions");

    const { data: item, error: itemError } = await serviceClient
      .from("portfolio_items")
      .insert({ user_id: userId, item_type: "award", title: "[E2E TEST] expired verifier claim" })
      .select("id")
      .single();
    if (itemError || !item) throw new Error(`failed to insert test item: ${itemError?.message}`);
    createdItemIds.push(item.id);

    const rawToken = generateVerificationToken();
    const tokenHash = hashVerificationToken(rawToken);
    await serviceClient.from("portfolio_verifications").insert({
      user_id: userId,
      portfolio_item_id: item.id,
      verification_level: "evidence_added",
      verification_code_hash: tokenHash,
      requested_at: new Date().toISOString(),
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });

    const result = await confirmVerifierClaim(rawToken);
    expect(result.error).toBe("This verification link has expired.");

    const { data: verification } = await serviceClient
      .from("portfolio_verifications")
      .select("verification_level, verification_code_hash")
      .eq("portfolio_item_id", item.id)
      .single();
    expect(verification?.verification_level).toBe("evidence_added");
    expect(verification?.verification_code_hash).not.toBeNull();
  });
});

if (!isolated) {
  describe("resolveVerifierClaim", () => {
    it.skip("skipped — no isolated local Supabase backend configured in this run", () => {});
  });
}

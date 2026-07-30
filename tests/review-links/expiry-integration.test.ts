/**
 * Integration coverage for review-link expiry (spec Part 15's "expired
 * review link" scenario) that can't be exercised through the UI — the
 * student-facing create form always issues a 30-day-out link, so an
 * already-expired row has to be inserted directly. Runs against the
 * isolated local Supabase instance only (same E2E_SUPABASE_* vars as
 * Playwright); skips itself when that isn't configured, exactly like the
 * rest of this codebase's E2E-gated tooling — never runs against
 * production, and never fails a plain `npm test` run that has no live
 * backend available.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getReviewLinkForReviewer } from "@/lib/review-links/actions";
import { generateVerificationToken, hashVerificationToken } from "@/lib/verification/tokens";

/**
 * This test exercises getReviewLinkForReviewer() directly, which reads
 * NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (the app's own client
 * construction — see src/lib/verification/repository.ts), not the
 * E2E_SUPABASE_* vars the Playwright/e2e-seed harness uses. The safety
 * property that actually matters here is simpler than
 * requireIsolatedE2eBackend()'s: never run unless NEXT_PUBLIC_SUPABASE_URL
 * is explicitly a loopback address. Skips itself otherwise — including in
 * a plain `npm test` run, which never has these vars pointed at a live
 * database at all.
 */
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

maybeDescribe("review link expiry/revocation — real local Supabase", () => {
  let serviceClient: ReturnType<typeof import("@/lib/review-links/repository").createReviewLinkServiceRoleClient>;
  let userId: string;
  const createdLinkIds: string[] = [];

  beforeAll(async () => {
    const { createReviewLinkServiceRoleClient } = await import("@/lib/review-links/repository");
    serviceClient = createReviewLinkServiceRoleClient();

    const { data: authUser, error } = await serviceClient.auth.admin.createUser({
      email: `e2e+expiry-${randomUUID().slice(0, 8)}@e2e.avela.invalid`,
      password: randomUUID(),
      email_confirm: true,
    });
    if (error || !authUser.user) throw new Error(`failed to create test user: ${error?.message}`);
    userId = authUser.user.id;
  });

  afterAll(async () => {
    if (createdLinkIds.length > 0) {
      await serviceClient.from("portfolio_review_links").delete().in("id", createdLinkIds);
    }
    if (userId) await serviceClient.auth.admin.deleteUser(userId);
  });

  it("an expired link is never returned to a reviewer, even with a correct token", async () => {
    const rawToken = generateVerificationToken();
    const tokenHash = hashVerificationToken(rawToken);
    const pastExpiry = new Date(Date.now() - 60_000).toISOString();

    const { data: link, error } = await serviceClient
      .from("portfolio_review_links")
      .insert({ user_id: userId, title: "[E2E TEST] expired link", token_hash: tokenHash, expires_at: pastExpiry })
      .select("id")
      .single();
    if (error || !link) throw new Error(`failed to insert test link: ${error?.message}`);
    createdLinkIds.push(link.id);

    const view = await getReviewLinkForReviewer(rawToken);
    expect(view).toBeNull();
  });

  it("a revoked link is never returned to a reviewer, even before its expiry", async () => {
    const rawToken = generateVerificationToken();
    const tokenHash = hashVerificationToken(rawToken);
    const futureExpiry = new Date(Date.now() + 60_000 * 60).toISOString();

    const { data: link, error } = await serviceClient
      .from("portfolio_review_links")
      .insert({
        user_id: userId,
        title: "[E2E TEST] revoked link",
        token_hash: tokenHash,
        expires_at: futureExpiry,
        revoked_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !link) throw new Error(`failed to insert test link: ${error?.message}`);
    createdLinkIds.push(link.id);

    const view = await getReviewLinkForReviewer(rawToken);
    expect(view).toBeNull();
  });

  it("a guessed/invalid token never returns a real link, and never distinguishes 'wrong token' from 'expired'", async () => {
    const view = await getReviewLinkForReviewer("completely-made-up-guessed-token-1234567890");
    expect(view).toBeNull();
  });

  it("a still-valid, non-revoked link IS returned — proves the two negative tests above are actually meaningful, not just always-null", async () => {
    const rawToken = generateVerificationToken();
    const tokenHash = hashVerificationToken(rawToken);
    const futureExpiry = new Date(Date.now() + 60_000 * 60).toISOString();

    const { data: link, error } = await serviceClient
      .from("portfolio_review_links")
      .insert({ user_id: userId, title: "[E2E TEST] valid link", token_hash: tokenHash, expires_at: futureExpiry })
      .select("id")
      .single();
    if (error || !link) throw new Error(`failed to insert test link: ${error?.message}`);
    createdLinkIds.push(link.id);

    const view = await getReviewLinkForReviewer(rawToken);
    expect(view).not.toBeNull();
    expect(view?.title).toBe("[E2E TEST] valid link");
  });
});

if (!isolated) {
  describe("review link expiry/revocation", () => {
    it.skip("skipped — no isolated E2E_SUPABASE_* backend configured in this run", () => {});
  });
}

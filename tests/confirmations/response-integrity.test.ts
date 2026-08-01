/**
 * Milestone 10.10A security audit — regression coverage for a confirmed
 * race condition in submitConfirmationResponse: two concurrent submissions
 * against the same token both read the row before either write landed
 * (select-then-update, not atomic), so both could win and the second
 * would silently overwrite the first's response while still reporting
 * success. Runs against the isolated local Supabase instance only; skips
 * itself when that isn't configured — same pattern as
 * tests/review-links/expiry-integration.test.ts.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateVerificationToken, hashVerificationToken } from "@/lib/verification/tokens";

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

maybeDescribe("confirmation response integrity — real local Supabase", () => {
  let serviceClient: ReturnType<typeof import("@/lib/confirmations/repository").createConfirmationServiceRoleClient>;
  let userId: string;
  let itemId: string;
  const createdRequestIds: string[] = [];

  beforeAll(async () => {
    const { createConfirmationServiceRoleClient } = await import("@/lib/confirmations/repository");
    serviceClient = createConfirmationServiceRoleClient();

    const { data: authUser, error } = await serviceClient.auth.admin.createUser({
      email: `e2e+confirm-race-${randomUUID().slice(0, 8)}@e2e.avela.invalid`,
      password: randomUUID(),
      email_confirm: true,
    });
    if (error || !authUser.user) throw new Error(`failed to create test user: ${error?.message}`);
    userId = authUser.user.id;

    const { data: item, error: itemError } = await serviceClient
      .from("portfolio_items")
      .insert({ user_id: userId, item_type: "project", title: "[E2E TEST] race condition item", activity_category_key: "web_or_app", project_context: "personal_project" })
      .select("id")
      .single();
    if (itemError || !item) throw new Error(`failed to create test item: ${itemError?.message}`);
    itemId = item.id;
  });

  afterAll(async () => {
    if (createdRequestIds.length > 0) {
      await serviceClient.from("portfolio_confirmation_requests").delete().in("id", createdRequestIds);
    }
    if (itemId) await serviceClient.from("portfolio_items").delete().eq("id", itemId);
    if (userId) await serviceClient.auth.admin.deleteUser(userId);
  });

  async function createRequest(): Promise<string> {
    const tokenHash = hashVerificationToken(generateVerificationToken());
    const { data, error } = await serviceClient
      .from("portfolio_confirmation_requests")
      .insert({
        user_id: userId,
        portfolio_item_id: itemId,
        claim_dimensions: ["project_or_activity_exists"],
        reviewer_role: "teacher",
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 60_000 * 60).toISOString(),
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`failed to create test confirmation request: ${error?.message}`);
    createdRequestIds.push(data.id);
    return tokenHash;
  }

  it("of two concurrent submissions on the same token, exactly one succeeds", async () => {
    const { submitConfirmationResponse } = await import("@/lib/confirmations/repository");
    const tokenHash = await createRequest();

    const [resultA, resultB] = await Promise.all([
      submitConfirmationResponse(tokenHash, "can_confirm", "response A"),
      submitConfirmationResponse(tokenHash, "cannot_verify", "response B"),
    ]);

    const successes = [resultA, resultB].filter((r) => r.success);
    expect(successes).toHaveLength(1);

    const { data: row } = await serviceClient.from("portfolio_confirmation_requests").select("*").eq("token_hash", tokenHash).single();
    expect(row?.responded_at).not.toBeNull();
    // The stored response must match whichever call actually won — never a
    // hybrid/overwritten state, and never null despite one call reporting success.
    const winningNote = resultA.success ? "response A" : "response B";
    expect(row?.response_note).toBe(winningNote);
  });

  it("a third submission after a successful one is rejected, not silently accepted", async () => {
    const { submitConfirmationResponse } = await import("@/lib/confirmations/repository");
    const tokenHash = await createRequest();

    const first = await submitConfirmationResponse(tokenHash, "can_confirm", "first");
    expect(first.success).toBe(true);

    const second = await submitConfirmationResponse(tokenHash, "cannot_verify", "second");
    expect(second.success).toBe(false);

    const { data: row } = await serviceClient.from("portfolio_confirmation_requests").select("response_note").eq("token_hash", tokenHash).single();
    expect(row?.response_note).toBe("first");
  });
});

if (!isolated) {
  describe("confirmation response integrity", () => {
    it.skip("skipped — no isolated E2E_SUPABASE_* backend configured in this run", () => {});
  });
}

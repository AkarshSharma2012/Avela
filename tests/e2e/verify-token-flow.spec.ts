/**
 * Milestone 10.10B2A — public verification workflow (/verify/[token]).
 * Confirmed B1 audit defects fixed here:
 *   0. resolveVerifierClaim()'s revalidatePath() calls forced /verify/[token]
 *      to re-render with "This verification link isn't valid, or has
 *      already been used" immediately after a successful response, for
 *      every verifier (see src/lib/verification/actions.ts).
 *   1. The success message had no role/aria-live — never announced to
 *      assistive technology.
 *   2. Focus was left on <body> after a successful submission.
 *
 * A `portfolio_verifications` row is seeded directly (service-role, same
 * pattern as tests/review-links/expiry-integration.test.ts) rather than
 * driving the "Request verification" email UI — the app's only email
 * provider logs to the server console in dev (src/lib/email/provider.ts)
 * and isn't capturable from the Playwright test process, but the token
 * itself is just a hash lookup, identical either way.
 */

import { test, expect } from "./fixtures/e2e-session";
import { createE2eServiceRoleClient } from "../../src/lib/e2e/config";
import { computeVerificationExpiry, generateVerificationToken, hashVerificationToken } from "../../src/lib/verification/tokens";

async function seedVerifierClaim(userId: string, itemId: string) {
  const serviceClient = createE2eServiceRoleClient();
  const rawToken = generateVerificationToken();
  const tokenHash = hashVerificationToken(rawToken);

  const { error } = await serviceClient.from("portfolio_verifications").insert({
    user_id: userId,
    portfolio_item_id: itemId,
    verification_level: "evidence_added",
    verification_code_hash: tokenHash,
    requested_at: new Date().toISOString(),
    expires_at: computeVerificationExpiry(new Date()).toISOString(),
  });
  if (error) throw new Error(`failed to seed verifier claim: ${error.message}`);

  return { rawToken, serviceClient };
}

test.describe("Verifier response flow (/verify/[token])", () => {
  test.use({ personaKey: "digital_creator" });

  test("a verifier's first confirmation shows an announced, focused success state; the used link then fails safely; the token is single-use", async ({
    context,
    e2eSession,
  }) => {
    const { rawToken, serviceClient } = await seedVerifierClaim(e2eSession.userId, e2eSession.sampleItemId!);

    const verifierContext = await context.browser()!.newContext();
    const verifierPage = await verifierContext.newPage();
    await verifierPage.goto(`/verify/${rawToken}`);

    await expect(verifierPage.getByRole("heading", { name: "Confirm a claim" })).toBeVisible();
    // Exactly one main landmark before submission too.
    expect(await verifierPage.locator("main").count()).toBe(1);

    await verifierPage.getByRole("button", { name: "Yes, this is accurate" }).click();

    const status = verifierPage.getByRole("status");
    await expect(status).toBeVisible({ timeout: 10_000 });
    await expect(status.getByRole("heading", { name: "Response recorded" })).toBeVisible();
    await expect(status).toContainText("Thanks — your confirmation has been recorded.");

    // Focus moved into the announced success container — never left on
    // <body>, and never announced by a second, separate mechanism.
    const focusInfo = await verifierPage.evaluate(() => ({
      isBody: document.activeElement === document.body,
      role: document.activeElement?.getAttribute("role"),
    }));
    expect(focusInfo.isBody).toBe(false);
    expect(focusInfo.role).toBe("status");
    expect(await verifierPage.getByRole("status").count()).toBe(1);

    expect(await verifierPage.locator("main").count()).toBe(1);

    // A fresh visit to the same (now single-use-consumed) link shows the
    // safe "not valid/used" state — never the stale success state (the
    // exact bug this milestone fixes), and never a crash.
    await verifierPage.reload();
    await expect(verifierPage.getByText(/isn't valid, or has already been used/)).toBeVisible();

    const { data: verification } = await serviceClient
      .from("portfolio_verifications")
      .select("verification_level, verification_code_hash")
      .eq("portfolio_item_id", e2eSession.sampleItemId!)
      .single();
    expect(verification?.verification_level).toBe("externally_confirmed");
    expect(verification?.verification_code_hash).toBeNull();

    await verifierContext.close();
  });

  test("keyboard-only submission reaches the announced success state", async ({ context, e2eSession }) => {
    const { rawToken } = await seedVerifierClaim(e2eSession.userId, e2eSession.sampleItemId!);

    const verifierContext = await context.browser()!.newContext();
    const verifierPage = await verifierContext.newPage();
    await verifierPage.goto(`/verify/${rawToken}`);

    const confirmButton = verifierPage.getByRole("button", { name: "Yes, this is accurate" });
    await confirmButton.focus();
    await expect(confirmButton).toBeFocused();
    await verifierPage.keyboard.press("Enter");

    await expect(verifierPage.getByRole("status")).toBeVisible({ timeout: 10_000 });
    await verifierContext.close();
  });

  test("an invalid/guessed token fails safely and distinctly from success — never a role=status announcement", async ({ context }) => {
    const guessedContext = await context.browser()!.newContext();
    const guessedPage = await guessedContext.newPage();
    await guessedPage.goto("/verify/completely-guessed-token-0000000000000000000000");

    await expect(guessedPage.getByText(/isn't valid/)).toBeVisible();
    expect(await guessedPage.getByRole("status").count()).toBe(0);
    await guessedContext.close();
  });

  test("320px viewport has no horizontal overflow, and reduced motion doesn't break the success state", async ({ context, e2eSession }) => {
    const { rawToken } = await seedVerifierClaim(e2eSession.userId, e2eSession.sampleItemId!);

    const verifierContext = await context.browser()!.newContext({ viewport: { width: 320, height: 700 }, reducedMotion: "reduce" });
    const verifierPage = await verifierContext.newPage();
    await verifierPage.goto(`/verify/${rawToken}`);

    const noOverflowBefore = await verifierPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    expect(noOverflowBefore).toBe(true);

    await verifierPage.getByRole("button", { name: "Yes, this is accurate" }).click();
    await expect(verifierPage.getByRole("status")).toBeVisible({ timeout: 10_000 });

    const noOverflowAfter = await verifierPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    expect(noOverflowAfter).toBe(true);

    await verifierContext.close();
  });
});

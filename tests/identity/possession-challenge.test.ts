import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/osint/safe-fetch", () => ({
  safeFetch: vi.fn(),
}));

import { safeFetch } from "@/lib/osint/safe-fetch";
import { generatePossessionChallenge, verifyPossessionChallenge } from "@/lib/identity/possession-challenge";

const mockSafeFetch = vi.mocked(safeFetch);

describe("generatePossessionChallenge", () => {
  it("generates a random token, only ever exposes its hash for storage, and sets a short expiry", () => {
    const a = generatePossessionChallenge();
    const b = generatePossessionChallenge();
    expect(a.rawToken).not.toBe(b.rawToken);
    expect(a.rawToken).toMatch(/^avela-verify-/);
    expect(a.tokenHash).not.toContain(a.rawToken);
    expect(new Date(a.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("verifyPossessionChallenge", () => {
  it("fails closed on an expired challenge without even checking the target", async () => {
    const challenge = generatePossessionChallenge();
    const result = await verifyPossessionChallenge(
      { tokenHash: challenge.tokenHash, expiresAt: new Date(Date.now() - 1000).toISOString() },
      challenge.rawToken,
      "https://example.com/file.md"
    );
    expect(result).toEqual({ ok: false, reason: "expired" });
    expect(mockSafeFetch).not.toHaveBeenCalled();
  });

  it("rejects a presented token that doesn't match the stored hash", async () => {
    const challenge = generatePossessionChallenge();
    const result = await verifyPossessionChallenge(
      { tokenHash: challenge.tokenHash, expiresAt: challenge.expiresAt },
      "some-other-token",
      "https://example.com/file.md"
    );
    expect(result).toEqual({ ok: false, reason: "token_mismatch" });
    expect(mockSafeFetch).not.toHaveBeenCalled();
  });

  it("confirms possession only when the target page actually contains the token", async () => {
    const challenge = generatePossessionChallenge();
    mockSafeFetch.mockResolvedValueOnce({ status: "ok", finalUrl: "https://example.com/file.md", statusCode: 200, contentType: "text/plain", body: `hello ${challenge.rawToken} world` });
    const result = await verifyPossessionChallenge({ tokenHash: challenge.tokenHash, expiresAt: challenge.expiresAt }, challenge.rawToken, "https://example.com/file.md");
    expect(result).toEqual({ ok: true });
  });

  it("does not confirm when the target page doesn't contain the token", async () => {
    const challenge = generatePossessionChallenge();
    mockSafeFetch.mockResolvedValueOnce({ status: "ok", finalUrl: "https://example.com/file.md", statusCode: 200, contentType: "text/plain", body: "no token here" });
    const result = await verifyPossessionChallenge({ tokenHash: challenge.tokenHash, expiresAt: challenge.expiresAt }, challenge.rawToken, "https://example.com/file.md");
    expect(result).toEqual({ ok: false, reason: "not_found_at_target" });
  });

  it("treats a blocked/failed fetch as unconfirmed, never as an accidental pass", async () => {
    const challenge = generatePossessionChallenge();
    mockSafeFetch.mockResolvedValueOnce({ status: "blocked_private_address", finalUrl: "https://example.com/file.md", statusCode: null });
    const result = await verifyPossessionChallenge({ tokenHash: challenge.tokenHash, expiresAt: challenge.expiresAt }, challenge.rawToken, "https://example.com/file.md");
    expect(result).toEqual({ ok: false, reason: "fetch_failed" });
  });
});

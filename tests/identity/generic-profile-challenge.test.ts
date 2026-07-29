import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/osint/safe-fetch", () => ({
  safeFetch: vi.fn(),
}));

import { safeFetch } from "@/lib/osint/safe-fetch";
import {
  generateGenericProfileChallenge,
  isHttpsUrl,
  validateGenericChallengeTargetUrl,
  validateProviderForGenericChallenge,
  verifyGenericProfileChallenge,
} from "@/lib/identity/generic-profile-challenge";

const mockSafeFetch = vi.mocked(safeFetch);

afterEach(() => {
  mockSafeFetch.mockClear();
});

describe("validateProviderForGenericChallenge", () => {
  it("accepts a real proof_of_control-tier provider (e.g. GitLab)", () => {
    expect(validateProviderForGenericChallenge("gitlab")).toEqual({ valid: true });
  });

  it("rejects an unknown provider key, never throwing", () => {
    expect(validateProviderForGenericChallenge("not_a_real_provider")).toMatchObject({ valid: false });
  });

  it("rejects the oauth-tier provider (GitHub) — the generic challenge is only for proof_of_control-tier providers", () => {
    expect(validateProviderForGenericChallenge("github")).toMatchObject({ valid: false });
  });

  it("rejects a public_link_only-tier provider — never offers a fake 'connect' flow for one", () => {
    expect(validateProviderForGenericChallenge("spotify_artist_page")).toMatchObject({ valid: false });
  });

  it("rejects an unsupported_manual_only-tier provider", () => {
    expect(validateProviderForGenericChallenge("school_club_public_page")).toMatchObject({ valid: false });
  });
});

describe("isHttpsUrl / validateGenericChallengeTargetUrl", () => {
  it("accepts an https URL", () => {
    expect(isHttpsUrl("https://example.com/profile")).toBe(true);
    expect(validateGenericChallengeTargetUrl("https://example.com/profile")).toEqual({ valid: true });
  });

  it("rejects an http URL — HTTPS only per spec section 10, stricter than safe-fetch's general allowance", () => {
    expect(isHttpsUrl("http://example.com/profile")).toBe(false);
    expect(validateGenericChallengeTargetUrl("http://example.com/profile")).toMatchObject({ valid: false });
  });

  it("rejects a malformed URL without throwing", () => {
    expect(isHttpsUrl("not a url")).toBe(false);
    expect(validateGenericChallengeTargetUrl("not a url")).toMatchObject({ valid: false });
  });

  it("rejects a non-http(s) scheme (e.g. file://)", () => {
    expect(isHttpsUrl("file:///etc/passwd")).toBe(false);
  });
});

describe("generateGenericProfileChallenge", () => {
  it("generates a token whose hash actually corresponds to the raw token (regression check for the generate-twice bug)", async () => {
    const challenge = generateGenericProfileChallenge();
    mockSafeFetch.mockResolvedValueOnce({
      status: "ok",
      finalUrl: "https://example.com/page",
      statusCode: 200,
      contentType: "text/plain",
      body: `code: ${challenge.rawToken}`,
    });
    const result = await verifyGenericProfileChallenge(
      { tokenHash: challenge.tokenHash, expiresAt: challenge.expiresAt },
      challenge.rawToken,
      "https://example.com/page"
    );
    expect(result).toEqual({ ok: true });
  });

  it("sets an expiry in the future", () => {
    const challenge = generateGenericProfileChallenge();
    expect(new Date(challenge.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("verifyGenericProfileChallenge", () => {
  it("fails closed on an expired challenge without checking the target", async () => {
    const challenge = generateGenericProfileChallenge();
    const result = await verifyGenericProfileChallenge(
      { tokenHash: challenge.tokenHash, expiresAt: new Date(Date.now() - 1000).toISOString() },
      challenge.rawToken,
      "https://example.com/page"
    );
    expect(result).toEqual({ ok: false, reason: "expired" });
    expect(mockSafeFetch).not.toHaveBeenCalled();
  });

  it("treats a blocked/failed fetch (e.g. SSRF-blocked private address) as unconfirmed, never an accidental pass", async () => {
    const challenge = generateGenericProfileChallenge();
    mockSafeFetch.mockResolvedValueOnce({ status: "blocked_private_address", finalUrl: "https://example.com/page", statusCode: null });
    const result = await verifyGenericProfileChallenge({ tokenHash: challenge.tokenHash, expiresAt: challenge.expiresAt }, challenge.rawToken, "https://example.com/page");
    expect(result).toEqual({ ok: false, reason: "fetch_failed" });
  });

  it("does not confirm when the token isn't actually present on the page", async () => {
    const challenge = generateGenericProfileChallenge();
    mockSafeFetch.mockResolvedValueOnce({ status: "ok", finalUrl: "https://example.com/page", statusCode: 200, contentType: "text/plain", body: "nothing here" });
    const result = await verifyGenericProfileChallenge({ tokenHash: challenge.tokenHash, expiresAt: challenge.expiresAt }, challenge.rawToken, "https://example.com/page");
    expect(result).toEqual({ ok: false, reason: "not_found_at_target" });
  });
});

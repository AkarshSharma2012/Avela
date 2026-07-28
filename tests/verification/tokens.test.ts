import { describe, expect, it } from "vitest";

import {
  computeVerificationExpiry,
  generateVerificationToken,
  hashesMatch,
  hashVerificationToken,
  isTokenExpired,
} from "@/lib/verification/tokens";

describe("generateVerificationToken", () => {
  it("generates a long, URL-safe, non-predictable token each time", () => {
    const a = generateVerificationToken();
    const b = generateVerificationToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("hashVerificationToken", () => {
  it("is deterministic and never stores/returns the raw token", () => {
    const token = "abc123";
    const hash = hashVerificationToken(token);
    expect(hash).toBe(hashVerificationToken(token));
    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different hashes for different tokens", () => {
    expect(hashVerificationToken("a")).not.toBe(hashVerificationToken("b"));
  });
});

describe("hashesMatch", () => {
  it("returns true only for identical hex digests", () => {
    const hash = hashVerificationToken("same-token");
    expect(hashesMatch(hash, hash)).toBe(true);
  });

  it("returns false for different digests, including different lengths", () => {
    expect(hashesMatch(hashVerificationToken("a"), hashVerificationToken("b"))).toBe(false);
    expect(hashesMatch("abcd", "abcdef")).toBe(false);
  });
});

describe("computeVerificationExpiry / isTokenExpired", () => {
  it("computes an expiry ttlSeconds in the future", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const expiry = computeVerificationExpiry(now, 60);
    expect(expiry.toISOString()).toBe("2026-01-01T00:01:00.000Z");
  });

  it("treats a null expiry as expired (fail closed)", () => {
    expect(isTokenExpired(null)).toBe(true);
  });

  it("treats an unparseable expiry as expired (fail closed)", () => {
    expect(isTokenExpired("not-a-date")).toBe(true);
  });

  it("is not expired before the expiry moment, and is expired at/after it", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const expiresAt = computeVerificationExpiry(now, 60).toISOString();
    expect(isTokenExpired(expiresAt, new Date("2026-01-01T00:00:30Z"))).toBe(false);
    expect(isTokenExpired(expiresAt, new Date("2026-01-01T00:01:00Z"))).toBe(true);
    expect(isTokenExpired(expiresAt, new Date("2026-01-01T00:02:00Z"))).toBe(true);
  });
});

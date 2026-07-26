import { describe, expect, it } from "vitest";

import { computeQualityScore, type QualityScoreInput } from "@/lib/opportunities/quality";

const NOW = new Date("2026-07-26T12:00:00Z");

function input(overrides: Partial<QualityScoreInput> = {}): QualityScoreInput {
  return {
    sourceTrustLevel: "medium",
    hasValidApplicationUrl: true,
    deadlineStatus: "open",
    applicationStatus: "accepting_applications",
    eligibilityStatus: "partially_defined",
    verificationStatus: "unverified",
    lastVerifiedAt: null,
    sourceCount: 1,
    ...overrides,
  };
}

describe("computeQualityScore — source trust behavior", () => {
  it("scores a high-trust source higher than a low-trust one, all else equal", () => {
    const high = computeQualityScore(input({ sourceTrustLevel: "high" }), NOW);
    const low = computeQualityScore(input({ sourceTrustLevel: "low" }), NOW);
    expect(high.score).toBeGreaterThan(low.score);
  });

  it("never shows a raw score as the student-facing label — label is always one of the fixed five", () => {
    const result = computeQualityScore(input(), NOW);
    expect(["verified", "needs_review", "limited_information", "stale", "closed"]).toContain(
      result.label
    );
  });
});

describe("computeQualityScore — closed/rejected always win", () => {
  it("labels closed regardless of an otherwise-high score", () => {
    const result = computeQualityScore(
      input({
        sourceTrustLevel: "high",
        verificationStatus: "verified",
        deadlineStatus: "closed",
        lastVerifiedAt: NOW.toISOString(),
        sourceCount: 3,
      }),
      NOW
    );
    expect(result.label).toBe("closed");
  });

  it("labels closed for a rejected verification status", () => {
    const result = computeQualityScore(input({ verificationStatus: "rejected" }), NOW);
    expect(result.label).toBe("closed");
  });

  it("labels stale for a stale verification status even with a decent score", () => {
    const result = computeQualityScore(
      input({ verificationStatus: "stale", sourceTrustLevel: "high" }),
      NOW
    );
    expect(result.label).toBe("stale");
  });
});

describe("computeQualityScore — verified label", () => {
  it("labels verified only when verification_status is verified and the score is high", () => {
    const result = computeQualityScore(
      input({
        verificationStatus: "verified",
        sourceTrustLevel: "high",
        eligibilityStatus: "defined",
        lastVerifiedAt: NOW.toISOString(),
        sourceCount: 2,
      }),
      NOW
    );
    expect(result.label).toBe("verified");
  });

  it("does not label verified when verification_status is verified but the score is still low", () => {
    const result = computeQualityScore(
      input({ verificationStatus: "verified", sourceTrustLevel: "low", hasValidApplicationUrl: false }),
      NOW
    );
    expect(result.label).not.toBe("verified");
  });
});

describe("computeQualityScore — score bounds", () => {
  it("never exceeds 100 or drops below 0", () => {
    const max = computeQualityScore(
      input({
        sourceTrustLevel: "high",
        hasValidApplicationUrl: true,
        deadlineStatus: "open",
        eligibilityStatus: "defined",
        lastVerifiedAt: NOW.toISOString(),
        sourceCount: 5,
      }),
      NOW
    );
    expect(max.score).toBeLessThanOrEqual(100);

    const min = computeQualityScore(
      input({
        sourceTrustLevel: null,
        hasValidApplicationUrl: false,
        deadlineStatus: "unknown",
        eligibilityStatus: "undefined",
        lastVerifiedAt: null,
        sourceCount: 0,
      }),
      NOW
    );
    expect(min.score).toBeGreaterThanOrEqual(0);
  });
});

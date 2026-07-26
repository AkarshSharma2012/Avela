import { describe, expect, it } from "vitest";

import { computeVerificationLabel, type VerificationLabelInput } from "@/lib/opportunities/verification-labels";

const NOW = new Date("2026-07-26T12:00:00Z");

function makeInput(overrides: Partial<VerificationLabelInput> = {}): VerificationLabelInput {
  return {
    sourceTrustLevel: "high",
    applicationUrlOk: true,
    gradeEligibilityClear: true,
    deadlineStatus: "open",
    applicationStatus: "accepting_applications",
    isRolling: false,
    isNextCycleAnnounced: false,
    hasUnresolvedConflict: false,
    lastVerifiedAt: NOW.toISOString(),
    ...overrides,
  };
}

describe("computeVerificationLabel", () => {
  it("labels a fully-qualified, currently-accepting listing as verified_accepting", () => {
    expect(computeVerificationLabel(makeInput(), NOW)).toBe("verified_accepting");
  });

  it("labels a fully-qualified rolling-admissions listing as verified_accepting", () => {
    expect(
      computeVerificationLabel(
        makeInput({ deadlineStatus: "rolling", applicationStatus: "unknown", isRolling: true }),
        NOW
      )
    ).toBe("verified_accepting");
  });

  it("labels a fully-qualified next-cycle-announced listing as verified_next_cycle, even with no exact deadline", () => {
    expect(
      computeVerificationLabel(
        makeInput({
          deadlineStatus: "unknown",
          applicationStatus: "opening_soon",
          isNextCycleAnnounced: true,
        }),
        NOW
      )
    ).toBe("verified_next_cycle");
  });

  it("labels a fully-qualified opening-soon listing (no next-cycle phrase) as verified_opening_soon", () => {
    expect(
      computeVerificationLabel(
        makeInput({ deadlineStatus: "upcoming", applicationStatus: "opening_soon" }),
        NOW
      )
    ).toBe("verified_opening_soon");
  });

  it("labels a fully-qualified listing with no clear status signal as partially_verified_deadline_unclear, not needs_review", () => {
    expect(
      computeVerificationLabel(
        makeInput({ deadlineStatus: "unknown", applicationStatus: "unknown" }),
        NOW
      )
    ).toBe("partially_verified_deadline_unclear");
  });

  it("closed always wins, even with an otherwise fully-qualified source", () => {
    expect(computeVerificationLabel(makeInput({ deadlineStatus: "closed" }), NOW)).toBe("closed");
    expect(computeVerificationLabel(makeInput({ applicationStatus: "closed" }), NOW)).toBe("closed");
  });

  it("caps at needs_review when there is an unresolved conflict, regardless of otherwise qualifying", () => {
    expect(computeVerificationLabel(makeInput({ hasUnresolvedConflict: true }), NOW)).toBe("needs_review");
  });

  it("caps at needs_review when the source is not high trust", () => {
    expect(computeVerificationLabel(makeInput({ sourceTrustLevel: "medium" }), NOW)).toBe("needs_review");
  });

  it("caps at needs_review when the application URL isn't confirmed working", () => {
    expect(computeVerificationLabel(makeInput({ applicationUrlOk: false }), NOW)).toBe("needs_review");
  });

  it("caps at needs_review when grade eligibility isn't clear", () => {
    expect(computeVerificationLabel(makeInput({ gradeEligibilityClear: false }), NOW)).toBe("needs_review");
  });

  it("labels a listing as stale once its last verification is old enough, before any other check", () => {
    const longAgo = new Date(NOW.getTime() - 200 * 86_400_000).toISOString();
    expect(computeVerificationLabel(makeInput({ lastVerifiedAt: longAgo }), NOW)).toBe("stale");
  });
});

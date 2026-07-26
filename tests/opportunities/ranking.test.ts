import { describe, expect, it } from "vitest";

import { rankOpportunities, type RankingInput } from "@/lib/opportunities/ranking";

const NOW = new Date("2026-07-26T12:00:00Z");

function makeInput(id: string, overrides: Partial<RankingInput> = {}): RankingInput {
  return {
    id,
    eligibilityStatus: "eligible",
    deadlineStatus: "open",
    applicationStatus: "accepting_applications",
    verificationStatus: "verified",
    matchTier: "strong_fit",
    applicationDeadline: "2026-08-01T00:00:00Z",
    weeklyCommitmentHours: null,
    studentMaxWeeklyHours: null,
    costPreferenceMatch: null,
    formatPreferenceMatch: null,
    hasCompleteInformation: true,
    ...overrides,
  };
}

describe("rankOpportunities — exclusions", () => {
  it("never ranks an expired (closed deadline) opportunity", () => {
    const results = rankOpportunities(
      [makeInput("a"), makeInput("b", { deadlineStatus: "closed" })],
      NOW
    );
    expect(results.map((r) => r.opportunity.id)).toEqual(["a"]);
  });

  it("never ranks a clearly ineligible opportunity", () => {
    const results = rankOpportunities(
      [makeInput("a"), makeInput("b", { eligibilityStatus: "ineligible" })],
      NOW
    );
    expect(results.map((r) => r.opportunity.id)).toEqual(["a"]);
  });
});

describe("rankOpportunities — priority order", () => {
  it("ranks eligible-and-accepting above eligible-but-not-yet-accepting", () => {
    const results = rankOpportunities(
      [
        makeInput("waiting", { applicationStatus: "opening_soon" }),
        makeInput("accepting", { applicationStatus: "accepting_applications" }),
      ],
      NOW
    );
    expect(results.map((r) => r.opportunity.id)).toEqual(["accepting", "waiting"]);
  });

  it("ranks verified above unverified, all else equal", () => {
    const results = rankOpportunities(
      [
        makeInput("unverified", { verificationStatus: "unverified" }),
        makeInput("verified", { verificationStatus: "verified" }),
      ],
      NOW
    );
    expect(results.map((r) => r.opportunity.id)).toEqual(["verified", "unverified"]);
  });

  it("ranks a strong profile match above a limited fit, all else equal", () => {
    const results = rankOpportunities(
      [
        makeInput("limited", { matchTier: "limited_fit" }),
        makeInput("strong", { matchTier: "strong_fit" }),
      ],
      NOW
    );
    expect(results.map((r) => r.opportunity.id)).toEqual(["strong", "limited"]);
  });

  it("ranks a nearer deadline above a farther one, all else equal", () => {
    const results = rankOpportunities(
      [
        makeInput("far", { applicationDeadline: "2027-01-01T00:00:00Z" }),
        makeInput("near", { applicationDeadline: "2026-08-01T00:00:00Z" }),
      ],
      NOW
    );
    expect(results.map((r) => r.opportunity.id)).toEqual(["near", "far"]);
  });

  it("ranks unknown eligibility below known-eligible", () => {
    const results = rankOpportunities(
      [
        makeInput("unclear", { eligibilityStatus: "unclear" }),
        makeInput("eligible", { eligibilityStatus: "eligible" }),
      ],
      NOW
    );
    expect(results.map((r) => r.opportunity.id)).toEqual(["eligible", "unclear"]);
  });

  it("ranks a commitment that fits above one that exceeds availability", () => {
    const results = rankOpportunities(
      [
        makeInput("exceeds", { weeklyCommitmentHours: 20, studentMaxWeeklyHours: 5 }),
        makeInput("fits", { weeklyCommitmentHours: 3, studentMaxWeeklyHours: 5 }),
      ],
      NOW
    );
    expect(results.map((r) => r.opportunity.id)).toEqual(["fits", "exceeds"]);
  });

  it("ranks complete information above incomplete, as the lowest-priority tiebreaker", () => {
    const results = rankOpportunities(
      [
        makeInput("incomplete", { hasCompleteInformation: false }),
        makeInput("complete", { hasCompleteInformation: true }),
      ],
      NOW
    );
    expect(results.map((r) => r.opportunity.id)).toEqual(["complete", "incomplete"]);
  });

  it("assigns sequential ranks starting at 1 and includes a non-empty explanation", () => {
    const results = rankOpportunities([makeInput("a"), makeInput("b")], NOW);
    expect(results.map((r) => r.rank)).toEqual([1, 2]);
    for (const result of results) {
      expect(result.explanation.length).toBeGreaterThan(0);
    }
  });
});

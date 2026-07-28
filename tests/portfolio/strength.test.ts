import { describe, expect, it } from "vitest";

import { computeProfileStrength, isPortfolioItemIncomplete, type ProfileStrengthInput } from "@/lib/portfolio/strength";
import type { PortfolioItem } from "@/types/portfolio";
import type { PortfolioItemType } from "@/types/database";

let counter = 0;
function makeItem(overrides: Partial<PortfolioItem> & { item_type: PortfolioItemType }): PortfolioItem {
  counter += 1;
  return {
    id: overrides.id ?? `item-${counter}`,
    user_id: "user-1",
    title: "Untitled",
    organization: null,
    description: null,
    start_date: null,
    end_date: null,
    is_current: false,
    hours_per_week: null,
    weeks_per_year: null,
    role: null,
    outcome: null,
    skills: [],
    tags: [],
    url: null,
    github_username: null,
    visibility: "visible",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

function score(items: PortfolioItem[], extra: Partial<ProfileStrengthInput> = {}) {
  return computeProfileStrength({
    items,
    fileCountByItemId: new Map(),
    linkedItemIds: new Set(),
    ...extra,
  });
}

describe("computeProfileStrength", () => {
  it("scores an empty portfolio at zero with a suggestion to add the first item", () => {
    const result = score([]);
    expect(result.score).toBe(0);
    expect(result.suggestions[0]).toMatch(/add your first portfolio item/i);
  });

  it("never reads cost, pay, or prestige — a volunteer item and a work-experience item with identical detail earn identical points", () => {
    const volunteer = makeItem({
      item_type: "volunteer_service",
      id: "v1",
      start_date: "2026-01-01",
      outcome: "Helped organize a food drive.",
      skills: ["Organizing"],
    });
    const paidWork = makeItem({
      item_type: "work_experience",
      id: "w1",
      start_date: "2026-01-01",
      outcome: "Helped organize a food drive.",
      skills: ["Organizing"],
    });

    const volunteerScore = score([volunteer]);
    const paidScore = score([paidWork]);

    expect(volunteerScore.score).toBe(paidScore.score);
    expect(volunteerScore.reasons).toEqual(paidScore.reasons);
  });

  it("gives full completeness credit once dates, outcome, and skills are all filled in", () => {
    const complete = makeItem({
      item_type: "project",
      start_date: "2026-01-01",
      outcome: "Built a working prototype.",
      skills: ["Python"],
    });
    const result = score([complete]);
    const completenessReason = result.reasons.find((r) => r.label.startsWith("How complete"));
    expect(completenessReason?.points).toBe(completenessReason?.maxPoints);
  });

  it("does not penalize proof for item types that have nothing to attach (skill, link)", () => {
    const skillItem = makeItem({ item_type: "skill" });
    const result = score([skillItem]);
    const proofReason = result.reasons.find((r) => r.label.startsWith("Proof attached"));
    expect(proofReason?.points).toBe(proofReason?.maxPoints);
  });

  it("credits proof for a proof-relevant item once it has a file or a link", () => {
    const award = makeItem({ item_type: "award", id: "a1" });
    const withoutProof = score([award]);
    const withProof = score([award], { fileCountByItemId: new Map([["a1", 1]]) });
    const proofReasonWithout = withoutProof.reasons.find((r) => r.label.startsWith("Proof attached"));
    const proofReasonWith = withProof.reasons.find((r) => r.label.startsWith("Proof attached"));
    expect(proofReasonWith!.points).toBeGreaterThan(proofReasonWithout!.points);
  });

  it("credits an item attached as evidence to a real application", () => {
    const item = makeItem({ item_type: "award", id: "a1" });
    const withoutLink = score([item]);
    const withLink = score([item], { linkedItemIds: new Set(["a1"]) });
    const linkedReasonWithout = withoutLink.reasons.find((r) => r.label.includes("backing up"));
    const linkedReasonWith = withLink.reasons.find((r) => r.label.includes("backing up"));
    expect(linkedReasonWith!.points).toBeGreaterThan(linkedReasonWithout!.points);
  });

  it("rewards a wider variety of evidence types", () => {
    const oneType = score([makeItem({ item_type: "award", id: "1" }), makeItem({ item_type: "award", id: "2" })]);
    const twoTypes = score([makeItem({ item_type: "award", id: "1" }), makeItem({ item_type: "project", id: "2" })]);
    const coverageOne = oneType.reasons.find((r) => r.label.includes("type"));
    const coverageTwo = twoTypes.reasons.find((r) => r.label.includes("type"));
    expect(coverageTwo!.points).toBeGreaterThan(coverageOne!.points);
  });
});

describe("computeProfileStrength — verification trust bonus (Milestone 10.5)", () => {
  it("adds zero trust bonus when no verification data is supplied at all", () => {
    const item = makeItem({ item_type: "award", id: "a1" });
    const result = score([item]);
    const trustReason = result.reasons.find((r) => r.label.startsWith("Evidence verification"));
    expect(trustReason?.points).toBe(0);
  });

  it("never penalizes an unverified item — every other category matches an externally-confirmed twin exactly", () => {
    const unverified = makeItem({ item_type: "volunteer_service", id: "u1", start_date: "2026-01-01", outcome: "Helped out.", skills: ["Care"] });
    const confirmed = makeItem({ item_type: "volunteer_service", id: "c1", start_date: "2026-01-01", outcome: "Helped out.", skills: ["Care"] });

    const unverifiedResult = score([unverified], { verificationLevelByItemId: new Map([["u1", "unverified"]]) });
    const confirmedResult = score([confirmed], { verificationLevelByItemId: new Map([["c1", "externally_confirmed"]]) });

    const nonTrustReasons = (r: ReturnType<typeof score>["reasons"]) => r.filter((reason) => !reason.label.startsWith("Evidence verification"));
    expect(nonTrustReasons(unverifiedResult.reasons)).toEqual(nonTrustReasons(confirmedResult.reasons));
  });

  it("gives externally_confirmed the full trust bonus and unverified none", () => {
    const item = makeItem({ item_type: "award", id: "a1" });
    const confirmed = score([item], { verificationLevelByItemId: new Map([["a1", "externally_confirmed"]]) });
    const unverified = score([item], { verificationLevelByItemId: new Map([["a1", "unverified"]]) });
    const confirmedTrust = confirmed.reasons.find((r) => r.label.startsWith("Evidence verification"));
    const unverifiedTrust = unverified.reasons.find((r) => r.label.startsWith("Evidence verification"));
    expect(confirmedTrust?.points).toBe(confirmedTrust?.maxPoints);
    expect(unverifiedTrust?.points).toBe(0);
  });

  it("gives a rejected finding zero trust bonus, same as unverified — never a penalty below zero", () => {
    const item = makeItem({ item_type: "award", id: "a1" });
    const rejected = score([item], { verificationLevelByItemId: new Map([["a1", "rejected"]]) });
    const unverified = score([item], { verificationLevelByItemId: new Map([["a1", "unverified"]]) });
    const rejectedTrust = rejected.reasons.find((r) => r.label.startsWith("Evidence verification"));
    const unverifiedTrust = unverified.reasons.find((r) => r.label.startsWith("Evidence verification"));
    expect(rejectedTrust?.points).toBe(unverifiedTrust?.points);
    const nonTrustReasons = (r: ReturnType<typeof score>["reasons"]) => r.filter((reason) => !reason.label.startsWith("Evidence verification"));
    expect(nonTrustReasons(rejected.reasons)).toEqual(nonTrustReasons(unverified.reasons));
  });

  it("never reads item_type/organization for the trust bonus — a paid work_experience and an unpaid volunteer_service at the same verification level earn identical bonus points", () => {
    const volunteer = makeItem({ item_type: "volunteer_service", id: "v1" });
    const paidWork = makeItem({ item_type: "work_experience", id: "w1" });
    const volunteerResult = score([volunteer], { verificationLevelByItemId: new Map([["v1", "externally_confirmed"]]) });
    const paidResult = score([paidWork], { verificationLevelByItemId: new Map([["w1", "externally_confirmed"]]) });
    const volunteerTrust = volunteerResult.reasons.find((r) => r.label.startsWith("Evidence verification"));
    const paidTrust = paidResult.reasons.find((r) => r.label.startsWith("Evidence verification"));
    expect(volunteerTrust?.points).toBe(paidTrust?.points);
  });
});

describe("isPortfolioItemIncomplete", () => {
  it("is incomplete when nothing but a title and type are set", () => {
    expect(isPortfolioItemIncomplete(makeItem({ item_type: "activity" }))).toBe(true);
  });

  it("is complete once any core detail is present", () => {
    expect(isPortfolioItemIncomplete(makeItem({ item_type: "activity", outcome: "Placed 2nd." }))).toBe(false);
    expect(isPortfolioItemIncomplete(makeItem({ item_type: "activity", skills: ["Writing"] }))).toBe(false);
    expect(isPortfolioItemIncomplete(makeItem({ item_type: "activity", start_date: "2026-01-01" }))).toBe(false);
    expect(isPortfolioItemIncomplete(makeItem({ item_type: "activity", description: "A club I joined." }))).toBe(false);
  });
});

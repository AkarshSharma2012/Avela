import { describe, expect, it } from "vitest";

import { computeSearchRelevance, sortByRelevance, type RelevanceRankable } from "@/lib/opportunities/search-ranking";

function makeItem(overrides: Partial<RelevanceRankable> = {}): RelevanceRankable {
  return {
    id: "1",
    title: "Robotics Summer Camp",
    organization: "Example University",
    description: "A hands-on robotics program for students.",
    interestTags: ["Engineering"],
    opportunityType: "summer_program",
    locationText: "Seattle, WA",
    verificationLabel: "verified_accepting",
    applicationStatus: "accepting_applications",
    ...overrides,
  };
}

describe("computeSearchRelevance", () => {
  it("scores an exact title match higher than a partial title match", () => {
    const exact = computeSearchRelevance(makeItem({ title: "Robotics" }), "robotics");
    const partial = computeSearchRelevance(makeItem({ title: "Advanced Robotics Camp" }), "robotics");
    expect(exact).toBeGreaterThan(partial);
  });

  it("scores a title match higher than only a description match", () => {
    const titleMatch = computeSearchRelevance(makeItem({ title: "Robotics Camp" }), "robotics");
    const descriptionOnly = computeSearchRelevance(
      makeItem({ title: "Summer Program", description: "Includes a robotics unit." }),
      "robotics"
    );
    expect(titleMatch).toBeGreaterThan(descriptionOnly);
  });

  it("gives credit for an exact interest-tag match", () => {
    const withTag = computeSearchRelevance(makeItem({ interestTags: ["Engineering"] }), "engineering");
    const withoutTag = computeSearchRelevance(makeItem({ interestTags: ["Music"] }), "engineering");
    expect(withTag).toBeGreaterThan(withoutTag);
  });

  it("adds profile-match points for overlapping interest tags, independent of the search query", () => {
    const matched = computeSearchRelevance(makeItem({ interestTags: ["Engineering"] }), "", ["Engineering"]);
    const unmatched = computeSearchRelevance(makeItem({ interestTags: ["Music"] }), "", ["Engineering"]);
    expect(matched).toBeGreaterThan(unmatched);
  });

  it("ranks a verified/accepting listing above an otherwise-identical needs_review listing", () => {
    const verified = computeSearchRelevance(makeItem({ verificationLabel: "verified_accepting" }), "robotics");
    const needsReview = computeSearchRelevance(
      makeItem({ verificationLabel: "needs_review", applicationStatus: "unknown" }),
      "robotics"
    );
    expect(verified).toBeGreaterThan(needsReview);
  });

  it("ranks a stale listing below a needs_review listing that is otherwise identical", () => {
    const stale = computeSearchRelevance(makeItem({ verificationLabel: "stale" }), "");
    const needsReview = computeSearchRelevance(makeItem({ verificationLabel: "needs_review" }), "");
    expect(needsReview).toBeGreaterThan(stale);
  });
});

describe("sortByRelevance", () => {
  it("orders results by descending relevance score", () => {
    const items = [
      makeItem({ id: "a", title: "Summer Program", description: "General description." }),
      makeItem({ id: "b", title: "Robotics Camp" }),
    ];
    const sorted = sortByRelevance(items, "robotics");
    expect(sorted.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("breaks ties deterministically by id", () => {
    const items = [makeItem({ id: "z" }), makeItem({ id: "a" })];
    const sorted = sortByRelevance(items, "");
    expect(sorted.map((item) => item.id)).toEqual(["a", "z"]);
  });
});

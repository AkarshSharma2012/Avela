import { describe, expect, it } from "vitest";

import {
  buildReviewQueueEntries,
  evaluateReviewNeed,
  type ReviewCheckInput,
} from "@/lib/opportunities/review-queue";

function input(overrides: Partial<ReviewCheckInput> = {}): ReviewCheckInput {
  return {
    deadlineStatus: "open",
    applicationStatus: "accepting_applications",
    hasConflictingSourceInfo: false,
    isProbableDuplicate: false,
    gradeExtractionConfidence: 95,
    applicationUrlReachable: true,
    daysSinceSourceSuccess: 1,
    hasResidencyOrCitizenshipAmbiguity: false,
    ...overrides,
  };
}

describe("evaluateReviewNeed", () => {
  it("needs no review when every signal is clean", () => {
    const result = evaluateReviewNeed(input());
    expect(result.needsReview).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it("flags an unknown deadline", () => {
    expect(evaluateReviewNeed(input({ deadlineStatus: "unknown" })).reasons).toContain(
      "unknown_deadline"
    );
  });

  it("flags conflicting source info", () => {
    expect(evaluateReviewNeed(input({ hasConflictingSourceInfo: true })).reasons).toContain(
      "conflicting_sources"
    );
  });

  it("flags a probable duplicate", () => {
    expect(evaluateReviewNeed(input({ isProbableDuplicate: true })).reasons).toContain(
      "probable_duplicate"
    );
  });

  it("flags low-confidence grade extraction", () => {
    expect(
      evaluateReviewNeed(input({ gradeExtractionConfidence: 40 })).reasons
    ).toContain("low_confidence_grade");
  });

  it("does not flag grade confidence when it wasn't extracted from free text at all", () => {
    expect(
      evaluateReviewNeed(input({ gradeExtractionConfidence: null })).reasons
    ).not.toContain("low_confidence_grade");
  });

  it("flags an unclear application status", () => {
    expect(evaluateReviewNeed(input({ applicationStatus: "unknown" })).reasons).toContain(
      "unclear_application_status"
    );
  });

  it("flags a broken application URL, but not an unchecked one", () => {
    expect(evaluateReviewNeed(input({ applicationUrlReachable: false })).reasons).toContain(
      "broken_application_url"
    );
    expect(evaluateReviewNeed(input({ applicationUrlReachable: null })).reasons).not.toContain(
      "broken_application_url"
    );
  });

  it("flags a stale source past the threshold", () => {
    expect(evaluateReviewNeed(input({ daysSinceSourceSuccess: 45 })).reasons).toContain(
      "stale_source"
    );
    expect(evaluateReviewNeed(input({ daysSinceSourceSuccess: 10 })).reasons).not.toContain(
      "stale_source"
    );
  });

  it("flags residency/citizenship ambiguity", () => {
    expect(
      evaluateReviewNeed(input({ hasResidencyOrCitizenshipAmbiguity: true })).reasons
    ).toContain("residency_citizenship_ambiguity");
  });
});

describe("buildReviewQueueEntries", () => {
  it("expands one review result into one row per reason", () => {
    const result = evaluateReviewNeed(
      input({ deadlineStatus: "unknown", isProbableDuplicate: true })
    );
    const entries = buildReviewQueueEntries(
      { opportunityId: "opp-1", rawRecordId: null },
      result,
      "flagged during ingestion"
    );
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.opportunity_id === "opp-1")).toBe(true);
    expect(entries.map((entry) => entry.reason).sort()).toEqual(
      ["probable_duplicate", "unknown_deadline"].sort()
    );
  });

  it("produces zero entries when nothing needs review", () => {
    const result = evaluateReviewNeed(input());
    expect(buildReviewQueueEntries({ opportunityId: "opp-1", rawRecordId: null }, result)).toEqual([]);
  });
});

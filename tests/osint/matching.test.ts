import { describe, expect, it } from "vitest";

import {
  assessManualReview,
  credentialIdMatch,
  dateOverlap,
  extractCredentialId,
  isAmbiguousName,
  organizationSimilarity,
  publicationAuthorMatch,
  repositoryOwnershipMatch,
  studentNameSimilarity,
  titleSimilarity,
} from "@/lib/osint/matching";

describe("titleSimilarity / organizationSimilarity", () => {
  it("scores identical titles as a perfect match", () => {
    expect(titleSimilarity("Science Fair Winner", "Science Fair Winner")).toBe(1);
  });

  it("scores completely unrelated titles as no match", () => {
    expect(titleSimilarity("Robotics Club Captain", "Bake Sale Volunteer")).toBe(0);
  });

  it("is tolerant of word order and minor phrasing differences", () => {
    expect(titleSimilarity("Lincoln High Robotics Club", "Robotics Club at Lincoln High")).toBeGreaterThan(0.7);
  });

  it("returns null organization similarity when either side is missing", () => {
    expect(organizationSimilarity(null, "Red Cross")).toBeNull();
    expect(organizationSimilarity("Red Cross", null)).toBeNull();
  });
});

describe("studentNameSimilarity — a matching name is only ever a weak, supporting signal", () => {
  it("scores an exact name match highly", () => {
    expect(studentNameSimilarity("Jordan Smith", "Jordan Smith")).toBeGreaterThanOrEqual(0.9);
  });

  it("returns null when there's no observed name to compare", () => {
    expect(studentNameSimilarity("Jordan Smith", null)).toBeNull();
  });

  it("a name match alone is a plain similarity score, never a special 'verified identity' flag — the caller (orchestrator) decides what it's worth", () => {
    const score = studentNameSimilarity("Jordan Smith", "Jordan Smith");
    expect(typeof score).toBe("number");
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe("isAmbiguousName — common/ambiguous name handling", () => {
  it("flags a single-word name as ambiguous", () => {
    expect(isAmbiguousName("Jordan")).toBe(true);
  });

  it("flags initials-only as ambiguous", () => {
    expect(isAmbiguousName("J S")).toBe(true);
  });

  it("does not flag an ordinary first+last name", () => {
    expect(isAmbiguousName("Jordan Smith")).toBe(false);
  });
});

describe("dateOverlap", () => {
  it("returns null when either side lacks a start date", () => {
    expect(dateOverlap(null, null, "2026-01-01", null)).toBeNull();
    expect(dateOverlap("2026-01-01", null, null, null)).toBeNull();
  });

  it("returns 1 when ranges clearly overlap", () => {
    expect(dateOverlap("2026-01-01", "2026-06-01", "2026-02-01", "2026-05-01")).toBe(1);
  });

  it("returns 0 (a material conflict) when ranges are far apart, beyond tolerance", () => {
    expect(dateOverlap("2020-01-01", "2020-06-01", "2026-01-01", "2026-06-01")).toBe(0);
  });

  it("treats dates within the tolerance window as still overlapping", () => {
    expect(dateOverlap("2026-01-01", "2026-01-01", "2026-02-01", "2026-02-01", 45)).toBe(1);
  });
});

describe("credentialIdMatch — exact credential ID match", () => {
  it("matches identical IDs regardless of casing/whitespace", () => {
    expect(credentialIdMatch("ABC-123", "abc-123")).toBe(true);
  });

  it("does not match different IDs", () => {
    expect(credentialIdMatch("ABC-123", "XYZ-999")).toBe(false);
  });

  it("returns null when either ID is missing", () => {
    expect(credentialIdMatch(null, "ABC-123")).toBeNull();
  });
});

describe("extractCredentialId", () => {
  it("pulls a certificate ID out of free text", () => {
    expect(extractCredentialId("Completed AWS Cloud Practitioner, Certificate ID: AWS-99231")).toBe("AWS-99231");
  });

  it("returns null when there's no recognizable ID pattern", () => {
    expect(extractCredentialId("A great certification I earned last summer")).toBeNull();
  });
});

describe("repositoryOwnershipMatch — GitHub ownership/contribution matching", () => {
  it("matches when the claimant owns the repo", () => {
    expect(repositoryOwnershipMatch("jordansmith", "jordansmith", [])).toBe(true);
  });

  it("matches when the claimant is a listed contributor", () => {
    expect(repositoryOwnershipMatch("jordansmith", "someorg", ["otheruser", "jordansmith"])).toBe(true);
  });

  it("does not match when the claimant is neither owner nor contributor", () => {
    expect(repositoryOwnershipMatch("jordansmith", "someorg", ["otheruser"])).toBe(false);
  });

  it("does not match with no claimant login at all", () => {
    expect(repositoryOwnershipMatch(null, "someorg", ["jordansmith"])).toBe(false);
  });
});

describe("publicationAuthorMatch — Crossref author/title matching", () => {
  it("matches a student who appears in the author list", () => {
    expect(publicationAuthorMatch("Jordan Smith", [{ given: "Jordan", family: "Smith" }])).toBe(true);
  });

  it("does not match when the student isn't among the authors", () => {
    expect(publicationAuthorMatch("Jordan Smith", [{ given: "Alex", family: "Nguyen" }])).toBe(false);
  });

  it("does not match against an empty author list", () => {
    expect(publicationAuthorMatch("Jordan Smith", [])).toBe(false);
  });
});

describe("assessManualReview — spec section 6's manual-review triggers", () => {
  it("flags an ambiguous student name", () => {
    const reasons = assessManualReview({
      claimedStudentName: "Jordan",
      claimedOrganization: null,
      observedOrganization: null,
      dateOverlapScore: null,
      sourceIsOfficial: true,
      sourceMentionsEvent: false,
      sourceMentionsStudent: false,
      repositoryOwnershipUnclear: false,
      possibleIdentityConfusion: false,
    });
    expect(reasons).toContain("ambiguous_student_name");
  });

  it("flags a material date conflict", () => {
    const reasons = assessManualReview({
      claimedStudentName: "Jordan Smith",
      claimedOrganization: null,
      observedOrganization: null,
      dateOverlapScore: 0,
      sourceIsOfficial: true,
      sourceMentionsEvent: false,
      sourceMentionsStudent: false,
      repositoryOwnershipUnclear: false,
      possibleIdentityConfusion: false,
    });
    expect(reasons).toContain("material_date_conflict");
  });

  it("flags an organization conflict when names diverge", () => {
    const reasons = assessManualReview({
      claimedStudentName: "Jordan Smith",
      claimedOrganization: "Lincoln High School",
      observedOrganization: "Roosevelt Middle School",
      dateOverlapScore: null,
      sourceIsOfficial: true,
      sourceMentionsEvent: false,
      sourceMentionsStudent: false,
      repositoryOwnershipUnclear: false,
      possibleIdentityConfusion: false,
    });
    expect(reasons).toContain("organization_conflict");
  });

  it("flags a source that mentions the event but not the student", () => {
    const reasons = assessManualReview({
      claimedStudentName: "Jordan Smith",
      claimedOrganization: null,
      observedOrganization: null,
      dateOverlapScore: null,
      sourceIsOfficial: true,
      sourceMentionsEvent: true,
      sourceMentionsStudent: false,
      repositoryOwnershipUnclear: false,
      possibleIdentityConfusion: false,
    });
    expect(reasons).toContain("source_silent_on_student");
  });

  it("flags unclear repository ownership", () => {
    const reasons = assessManualReview({
      claimedStudentName: "Jordan Smith",
      claimedOrganization: null,
      observedOrganization: null,
      dateOverlapScore: null,
      sourceIsOfficial: true,
      sourceMentionsEvent: false,
      sourceMentionsStudent: false,
      repositoryOwnershipUnclear: true,
      possibleIdentityConfusion: false,
    });
    expect(reasons).toContain("unclear_repository_ownership");
  });

  it("flags an unofficial-only source", () => {
    const reasons = assessManualReview({
      claimedStudentName: "Jordan Smith",
      claimedOrganization: null,
      observedOrganization: null,
      dateOverlapScore: null,
      sourceIsOfficial: false,
      sourceMentionsEvent: false,
      sourceMentionsStudent: false,
      repositoryOwnershipUnclear: false,
      possibleIdentityConfusion: false,
    });
    expect(reasons).toContain("unofficial_source_only");
  });

  it("returns no reasons for a clean, well-matched claim", () => {
    const reasons = assessManualReview({
      claimedStudentName: "Jordan Smith",
      claimedOrganization: "Lincoln High School",
      observedOrganization: "Lincoln High School",
      dateOverlapScore: 1,
      sourceIsOfficial: true,
      sourceMentionsEvent: true,
      sourceMentionsStudent: true,
      repositoryOwnershipUnclear: false,
      possibleIdentityConfusion: false,
    });
    expect(reasons).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import { scoreOsintEvidence, type ScoringInputs } from "@/lib/osint/scoring";

function baseInputs(overrides: Partial<ScoringInputs> = {}): ScoringInputs {
  return {
    hasDirectVerifierConfirmation: false,
    hasOfficialIssuerRecordMatch: false,
    hasOfficialOrgPageNamingStudent: false,
    hasTrustedRegistryExactMatch: false,
    hasGithubOwnerMatch: false,
    hasGithubContributorMatch: false,
    hasGithubCommitAuthorMatch: false,
    hasGithubDatesAlign: false,
    hasGithubReadmeMatch: false,
    hasGithubDeploymentUrlMatch: false,
    hasGithubTitleOnlyMatch: false,
    hasGithubDisplayNameOnlyMatch: false,
    independentSupportingSourceCount: 0,
    hasUploadedSupportingEvidence: false,
    datesAndOrganizationConsistent: false,
    hasConflictingDates: false,
    hasOrganizationMismatch: false,
    hasExpiredCredential: false,
    hasUnsafeOrSuspiciousUrl: false,
    hasReusedEvidenceAcrossUnrelatedClaims: false,
    hasAnyAuthoritativeSource: false,
    hasNonGithubAuthoritativeSource: false,
    hasAnyEvidence: false,
    requiresManualReview: false,
    ...overrides,
  };
}

describe("scoreOsintEvidence — no evidence is never interpreted as a false claim", () => {
  it("scores 0 and unable_to_verify when nothing was found", () => {
    const result = scoreOsintEvidence(baseInputs());
    expect(result.score).toBe(0);
    expect(result.supportLevel).toBe("unable_to_verify");
    expect(result.explanation.join(" ")).toMatch(/doesn't mean the claim is false/);
  });
});

describe("scoreOsintEvidence — authoritative source requirement", () => {
  it("never reaches confirmed_by_authoritative_source without hasAnyAuthoritativeSource, even at a high score", () => {
    const result = scoreOsintEvidence(
      baseInputs({
        independentSupportingSourceCount: 6, // 6 * 15 = 90 points — well past the confirmed threshold
        hasAnyEvidence: true,
        hasAnyAuthoritativeSource: false,
      })
    );
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.supportLevel).not.toBe("confirmed_by_authoritative_source");
  });

  it("reaches confirmed_by_authoritative_source when a real, non-GitHub authoritative match plus enough score are both present", () => {
    const result = scoreOsintEvidence(
      baseInputs({
        hasOfficialIssuerRecordMatch: true,
        hasOfficialOrgPageNamingStudent: true,
        hasAnyEvidence: true,
        hasAnyAuthoritativeSource: true,
        hasNonGithubAuthoritativeSource: true,
      })
    );
    expect(result.supportLevel).toBe("confirmed_by_authoritative_source");
  });
});

describe("scoreOsintEvidence — GitHub repository ownership", () => {
  it("repository existence alone (no owner/contributor/commit match) never confirms and scores 0", () => {
    const result = scoreOsintEvidence(baseInputs({ hasAnyEvidence: true }));
    expect(result.score).toBe(0);
    expect(result.supportLevel).toBe("unable_to_verify");
  });

  it("an exact owner match alone can reach strongly_supported but not confirmed_by_authoritative_source", () => {
    const result = scoreOsintEvidence(
      baseInputs({
        hasGithubOwnerMatch: true,
        hasGithubReadmeMatch: true,
        hasGithubDatesAlign: true,
        hasAnyEvidence: true,
        hasAnyAuthoritativeSource: true,
      })
    );
    expect(result.score).toBeGreaterThanOrEqual(45);
    expect(result.supportLevel).toBe("strongly_supported");
  });

  it("owner match plus contributor/commit-author evidence strongly supports ownership, but GitHub alone is capped below confirmed_by_authoritative_source", () => {
    const result = scoreOsintEvidence(
      baseInputs({
        hasGithubOwnerMatch: true,
        hasGithubContributorMatch: true,
        hasGithubCommitAuthorMatch: true,
        hasGithubReadmeMatch: true,
        hasAnyEvidence: true,
        hasAnyAuthoritativeSource: true,
        hasNonGithubAuthoritativeSource: false, // only GitHub evidence exists for this check
      })
    );
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.supportLevel).toBe("strongly_supported");
    expect(result.supportLevel).not.toBe("confirmed_by_authoritative_source");
  });

  it("the same strong GitHub evidence reaches confirmed_by_authoritative_source once corroborated by a non-GitHub authoritative source", () => {
    const result = scoreOsintEvidence(
      baseInputs({
        hasGithubOwnerMatch: true,
        hasGithubContributorMatch: true,
        hasGithubCommitAuthorMatch: true,
        hasOfficialOrgPageNamingStudent: true,
        hasAnyEvidence: true,
        hasAnyAuthoritativeSource: true,
        hasNonGithubAuthoritativeSource: true,
      })
    );
    expect(result.supportLevel).toBe("confirmed_by_authoritative_source");
  });

  it("display-name-only and title-only matches are weak and never move the level past partially_supported on their own", () => {
    const result = scoreOsintEvidence(
      baseInputs({
        hasGithubTitleOnlyMatch: true,
        hasGithubDisplayNameOnlyMatch: true,
        hasAnyEvidence: true,
      })
    );
    expect(result.score).toBeLessThan(45);
    expect(result.supportLevel).toBe("partially_supported");
  });

  it("project ownership evidence never implies an unrelated impact/achievement claim is confirmed", () => {
    // A confirmed project-ownership check says nothing about outcome/impact
    // text the student wrote elsewhere on the item — scoring only ever
    // reflects what evidence was actually matched.
    const ownershipOnly = scoreOsintEvidence(
      baseInputs({
        hasGithubOwnerMatch: true,
        hasGithubContributorMatch: true,
        hasGithubCommitAuthorMatch: true,
        hasOfficialOrgPageNamingStudent: true,
        hasAnyEvidence: true,
        hasAnyAuthoritativeSource: true,
        hasNonGithubAuthoritativeSource: true,
      })
    );
    expect(ownershipOnly.supportLevel).toBe("confirmed_by_authoritative_source");
    expect(ownershipOnly.contributions.some((c) => /impact|outcome|achievement/i.test(c.label))).toBe(false);
  });
});

describe("scoreOsintEvidence — RDAP and URL reputation carry no scoring weight of their own", () => {
  it("has no ScoringInputs field for RDAP or URL reputation at all — they can only ever affect hasUnsafeOrSuspiciousUrl", () => {
    const withNothingElse = scoreOsintEvidence(baseInputs({ hasAnyEvidence: true }));
    const withUnsafeUrl = scoreOsintEvidence(baseInputs({ hasAnyEvidence: true, hasUnsafeOrSuspiciousUrl: true }));
    expect(withNothingElse.score).toBe(0);
    expect(withUnsafeUrl.score).toBe(0); // negative weight floors at 0, never a positive contribution either
    expect(withUnsafeUrl.contributions.some((c) => c.points > 0)).toBe(false);
  });
});

describe("scoreOsintEvidence — multiple weak sources cannot substitute for one authoritative source", () => {
  it("a pile of independent secondary sources tops out at strongly_supported, never confirmed", () => {
    const result = scoreOsintEvidence(
      baseInputs({
        independentSupportingSourceCount: 10,
        hasAnyEvidence: true,
      })
    );
    expect(result.supportLevel).toBe("strongly_supported");
  });
});

describe("scoreOsintEvidence — manual review always wins over the score", () => {
  it("forces needs_review even when the score would otherwise confirm", () => {
    const result = scoreOsintEvidence(
      baseInputs({
        hasOfficialIssuerRecordMatch: true,
        hasOfficialOrgPageNamingStudent: true,
        hasAnyEvidence: true,
        hasAnyAuthoritativeSource: true,
        hasNonGithubAuthoritativeSource: true,
        requiresManualReview: true,
      })
    );
    expect(result.supportLevel).toBe("needs_review");
  });
});

describe("scoreOsintEvidence — bounded score", () => {
  it("never exceeds 100", () => {
    const result = scoreOsintEvidence(
      baseInputs({
        hasDirectVerifierConfirmation: true,
        hasOfficialIssuerRecordMatch: true,
        hasOfficialOrgPageNamingStudent: true,
        hasTrustedRegistryExactMatch: true,
        hasGithubOwnerMatch: true,
        hasGithubContributorMatch: true,
        hasGithubCommitAuthorMatch: true,
        hasGithubDatesAlign: true,
        hasGithubReadmeMatch: true,
        hasGithubDeploymentUrlMatch: true,
        independentSupportingSourceCount: 5,
        hasUploadedSupportingEvidence: true,
        datesAndOrganizationConsistent: true,
        hasAnyEvidence: true,
        hasAnyAuthoritativeSource: true,
        hasNonGithubAuthoritativeSource: true,
      })
    );
    expect(result.score).toBe(100);
  });

  it("never drops below 0", () => {
    const result = scoreOsintEvidence(
      baseInputs({
        hasConflictingDates: true,
        hasOrganizationMismatch: true,
        hasExpiredCredential: true,
        hasUnsafeOrSuspiciousUrl: true,
        hasReusedEvidenceAcrossUnrelatedClaims: true,
        hasAnyEvidence: true,
      })
    );
    expect(result.score).toBe(0);
  });
});

describe("scoreOsintEvidence — transparent score explanation", () => {
  it("includes a line-item contribution for every positive/negative factor applied", () => {
    const result = scoreOsintEvidence(baseInputs({ hasUploadedSupportingEvidence: true, hasConflictingDates: true, hasAnyEvidence: true }));
    const labels = result.contributions.map((c) => c.label);
    expect(labels).toContain("Uploaded supporting evidence already on file");
    expect(labels).toContain("Dates differ and may need clarification");
    expect(result.contributions.find((c) => c.label.includes("Uploaded"))?.points).toBe(10);
    expect(result.contributions.find((c) => c.label.includes("Dates differ"))?.points).toBe(-15);
  });

  it("the explanation is derivable entirely from the returned contributions — nothing hidden", () => {
    const result = scoreOsintEvidence(baseInputs({ hasUploadedSupportingEvidence: true, hasAnyEvidence: true }));
    for (const line of result.contributions) {
      expect(result.explanation.join("\n")).toContain(line.label);
    }
  });

  it("labels every GitHub score line specifically, not as a generic 'trusted registry' match", () => {
    const result = scoreOsintEvidence(
      baseInputs({ hasGithubOwnerMatch: true, hasGithubCommitAuthorMatch: true, hasAnyEvidence: true, hasAnyAuthoritativeSource: true })
    );
    const labels = result.contributions.map((c) => c.label);
    expect(labels.some((label) => label.includes("GitHub: repository owner"))).toBe(true);
    expect(labels.some((label) => label.includes("GitHub: commits are authored"))).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import { classificationNeedsReview, classifyVerifierDomain, findKnownOfficialDomain } from "@/lib/verification/verifier-legitimacy";
import type { DomainContextResult } from "@/lib/verification/domain-context";

function context(overrides: Partial<DomainContextResult> = {}): DomainContextResult {
  return {
    domain: "example.org",
    hasMx: true,
    hasSpf: true,
    hasDmarc: true,
    isFreeEmailProvider: false,
    isDisposable: false,
    isRoleMailbox: false,
    domainRegisteredAt: null,
    organizationDomainMatch: false,
    ...overrides,
  };
}

describe("classifyVerifierDomain", () => {
  it("requires manual review when the domain lookup itself failed", () => {
    expect(classifyVerifierDomain({ organization: null, context: null })).toBe("manual_review_required");
  });

  it("flags a disposable domain before anything else, even if it happens to look organization-aligned", () => {
    expect(classifyVerifierDomain({ organization: "Example Org", context: context({ isDisposable: true, organizationDomainMatch: true }) })).toBe(
      "suspicious_or_disposable"
    );
  });

  it("flags a repeated-verifier pattern when the caller supplies that signal", () => {
    expect(classifyVerifierDomain({ organization: null, context: context(), isRepeatedAcrossUnrelatedStudents: true })).toBe("repeated_verifier_pattern");
  });

  it("flags domain_mismatch only against a known official domain — never a bare guess", () => {
    const result = classifyVerifierDomain({ organization: "Red Cross", context: context({ domain: "totally-unrelated.example" }) });
    expect(result).toBe("domain_mismatch");
  });

  it("requires manual review when the domain has no MX record at all", () => {
    expect(classifyVerifierDomain({ organization: null, context: context({ hasMx: false }) })).toBe("manual_review_required");
  });

  it("classifies a role mailbox distinctly from a free-email address", () => {
    expect(classifyVerifierDomain({ organization: null, context: context({ isRoleMailbox: true }) })).toBe("role_mailbox");
  });

  it("classifies a known free-webmail domain as personal_or_free_email, not suspicious", () => {
    expect(classifyVerifierDomain({ organization: null, context: context({ isFreeEmailProvider: true }) })).toBe("personal_or_free_email");
  });

  it("classifies organization_domain_aligned when the light name/domain heuristic matches", () => {
    expect(classifyVerifierDomain({ organization: "Example Org", context: context({ organizationDomainMatch: true }) })).toBe("organization_domain_aligned");
  });

  it("falls back to organization_domain_unconfirmed — a neutral result, not a negative one — when nothing else applies", () => {
    expect(classifyVerifierDomain({ organization: "Some Org", context: context() })).toBe("organization_domain_unconfirmed");
  });
});

describe("findKnownOfficialDomain", () => {
  it("finds a match from the curated allowlist for a well-known organization name", () => {
    expect(findKnownOfficialDomain("American Red Cross")).toBe("redcross.org");
  });

  it("returns null for an organization with no curated match, and for no organization at all", () => {
    expect(findKnownOfficialDomain("My Local Chess Club")).toBeNull();
    expect(findKnownOfficialDomain(null)).toBeNull();
  });
});

describe("classificationNeedsReview", () => {
  it("routes only the two most severe classifications to a reviewer queue", () => {
    expect(classificationNeedsReview("suspicious_or_disposable")).toBe(true);
    expect(classificationNeedsReview("repeated_verifier_pattern")).toBe(true);
    expect(classificationNeedsReview("organization_domain_unconfirmed")).toBe(false);
    expect(classificationNeedsReview("manual_review_required")).toBe(false);
  });
});

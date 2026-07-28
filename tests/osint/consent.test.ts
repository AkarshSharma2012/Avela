import { describe, expect, it } from "vitest";

import { buildConsentSummary, freezeConsentScope, validateConsentGiven } from "@/lib/osint/consent";
import type { ClaimInput } from "@/lib/osint/types";

const BASE_CLAIM: ClaimInput = {
  claimType: "project",
  studentDisplayName: "Jordan Smith",
  title: "Robotics App",
  organization: null,
  role: null,
  description: null,
  startDate: null,
  endDate: null,
  url: "https://github.com/jordansmith/robotics-app",
  connectedGithubUsername: null,
};

describe("validateConsentGiven — consent enforcement", () => {
  it("rejects when consent was not given", () => {
    expect(validateConsentGiven(false)).not.toBeNull();
  });

  it("accepts when consent was given", () => {
    expect(validateConsentGiven(true)).toBeNull();
  });
});

describe("buildConsentSummary — spec section 3's 'show exactly which fields will be searched'", () => {
  it("always includes the student's name, the title, and the URL", () => {
    const summary = buildConsentSummary(BASE_CLAIM);
    expect(summary.fields).toEqual(expect.arrayContaining(["studentDisplayName", "title", "url"]));
  });

  it("only includes organization/role/dates when the claim actually has them", () => {
    const withExtras = buildConsentSummary({ ...BASE_CLAIM, organization: "Lincoln High", role: "Lead developer", startDate: "2026-01-01" });
    expect(withExtras.fields).toEqual(expect.arrayContaining(["organization", "role", "dates"]));

    const withoutExtras = buildConsentSummary(BASE_CLAIM);
    expect(withoutExtras.fields).not.toContain("organization");
    expect(withoutExtras.fields).not.toContain("role");
    expect(withoutExtras.fields).not.toContain("dates");
  });

  it("lists every possible public source type, regardless of what this particular claim will actually trigger", () => {
    const summary = buildConsentSummary(BASE_CLAIM);
    expect(summary.sourceTypes).toContain("github");
    expect(summary.sourceTypes).toContain("icann_rdap");
    expect(summary.sourceTypes).toContain("url_reputation");
  });
});

describe("freezeConsentScope", () => {
  it("stamps a consentedAt timestamp and carries the summary through unchanged", () => {
    const summary = buildConsentSummary(BASE_CLAIM);
    const scope = freezeConsentScope(summary, new Date("2026-07-28T00:00:00Z"));
    expect(scope.fields).toEqual(summary.fields);
    expect(scope.sourceTypes).toEqual(summary.sourceTypes);
    expect(scope.consentedAt).toBe("2026-07-28T00:00:00.000Z");
  });
});

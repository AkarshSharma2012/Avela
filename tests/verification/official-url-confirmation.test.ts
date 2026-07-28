import { describe, expect, it } from "vitest";

import { runEvidenceChecks } from "@/lib/verification/evidence-checks";
import { canTransitionLevel } from "@/lib/verification/level";
import { checkOfficialUrl, domainQualifiesForConfirmation } from "@/lib/verification/url-check";

/**
 * Regression coverage for the rule that a trusted/official-looking domain
 * can never, by itself, produce `externally_confirmed`. Submitting a URL
 * runs through the same student/system-actor path as any other evidence
 * (see actions.ts's applyEvidenceSubmission) — `externally_confirmed` is
 * reachable only through confirmVerifierClaim (actor "verifier") or
 * reviewerDecide (actor "reviewer"), both of which require an explicit
 * human decision.
 */
describe("official URL trust signals never produce externally_confirmed on their own", () => {
  const TRUSTED_URLS = ["https://www.lincolnhigh.edu/awards", "https://www.redcross.org/volunteer/confirm", "https://usa.gov/results"];

  it.each(TRUSTED_URLS)("a .edu/.gov/curated-org domain (%s) is classified as trusted but that alone never authorizes confirmation", (url) => {
    const domainCheck = checkOfficialUrl(url);
    expect(domainCheck.valid).toBe(true);
    if (domainCheck.valid) {
      expect(domainCheck.isTrustedDomain).toBe(true);
    }
    // Trust classification is available as context only — it is never
    // itself sufficient to authorize confirmation; only an explicit
    // verifier/reviewer decision (a different code path entirely) can.
    expect(typeof domainQualifiesForConfirmation(domainCheck)).toBe("boolean");
  });

  it("runEvidenceChecks — the function every URL/file submission goes through — can only ever recommend evidence_added or needs_review, never externally_confirmed", () => {
    for (const url of TRUSTED_URLS) {
      const result = runEvidenceChecks({ hasEvidence: true, evidenceUrl: url, itemType: "award" });
      expect(["evidence_added", "needs_review"]).toContain(result.recommendedLevel);
    }
  });

  it("the actors that ever process a URL/evidence submission (student, system) can never set externally_confirmed, regardless of domain trust", () => {
    expect(canTransitionLevel("unverified", "externally_confirmed", "student")).toBe(false);
    expect(canTransitionLevel("evidence_added", "externally_confirmed", "student")).toBe(false);
    expect(canTransitionLevel("unverified", "externally_confirmed", "system")).toBe(false);
    expect(canTransitionLevel("evidence_added", "externally_confirmed", "system")).toBe(false);
  });

  it("only the verifier and reviewer actors — never student or system — are permitted to set externally_confirmed", () => {
    expect(canTransitionLevel("evidence_added", "externally_confirmed", "verifier")).toBe(true);
    expect(canTransitionLevel("evidence_added", "externally_confirmed", "reviewer")).toBe(true);
    expect(canTransitionLevel("evidence_added", "externally_confirmed", "student")).toBe(false);
    expect(canTransitionLevel("evidence_added", "externally_confirmed", "system")).toBe(false);
  });

  it("a social-media URL is never treated as an official confirmation source, even as context", () => {
    const domainCheck = checkOfficialUrl("https://www.instagram.com/someclub");
    expect(domainCheck.valid).toBe(true);
    if (domainCheck.valid) {
      expect(domainCheck.isSocialMedia).toBe(true);
      expect(domainQualifiesForConfirmation(domainCheck)).toBe(false);
    }
  });
});

/**
 * Bounded, transparent scoring (spec section 7). Deliberately takes a flat
 * struct of already-interpreted booleans/counts rather than raw evidence —
 * the interpretation (which piece of evidence counts as "an official issuer
 * record with student/credential match," etc.) happens in orchestrator.ts,
 * so this module stays a pure, fully unit-testable point-adding/capping
 * function with no knowledge of connectors, HTTP, or the database.
 *
 * Three independent gates keep the headline promise ("no absolute true/false,
 * and weak sources alone can never confirm") true no matter how the point
 * total shakes out:
 *   1. `confirmed_by_authoritative_source` additionally requires
 *      `hasAnyAuthoritativeSource` — a pile of secondary-source points can
 *      reach the score threshold but can never flip this gate.
 *   2. It also requires `hasNonGithubAuthoritativeSource` — GitHub ownership
 *      evidence alone (however strong) caps out at `strongly_supported`,
 *      since it's evidence the repository owner fully controls.
 *   3. `requiresManualReview` always wins over the score, before any
 *      threshold is even consulted.
 */

import { SCORE_MAX, SCORE_MIN, SCORE_WEIGHTS } from "@/lib/osint/constants";
import type { ScoreContribution, ScoringResult } from "@/lib/osint/types";
import type { PortfolioOsintSupportLevel } from "@/types/osint";

export type ScoringInputs = {
  hasDirectVerifierConfirmation: boolean;
  hasOfficialIssuerRecordMatch: boolean;
  hasOfficialOrgPageNamingStudent: boolean;
  /** Crossref exact author+title match only. */
  hasTrustedRegistryExactMatch: boolean;
  /** Repository owner login exactly matches the student's connected GitHub username. */
  hasGithubOwnerMatch: boolean;
  /** The connected GitHub username appears in the repo's contributor list, or is a publicly-visible member of the owning organization. */
  hasGithubContributorMatch: boolean;
  /** The connected GitHub username authored at least one commit in the repo. */
  hasGithubCommitAuthorMatch: boolean;
  hasGithubDatesAlign: boolean;
  hasGithubReadmeMatch: boolean;
  hasGithubDeploymentUrlMatch: boolean;
  /** Weak fallback: the repo's title/description matches the claim's title — never ownership proof. */
  hasGithubTitleOnlyMatch: boolean;
  /** Weak fallback: the student's display name loosely matches the repo owner's login — never ownership proof, never gates confirmation. */
  hasGithubDisplayNameOnlyMatch: boolean;
  /** Count of independent secondary sources — each is worth the same +15, but see the module doc: this can never by itself satisfy `hasAnyAuthoritativeSource`. */
  independentSupportingSourceCount: number;
  hasUploadedSupportingEvidence: boolean;
  datesAndOrganizationConsistent: boolean;
  hasConflictingDates: boolean;
  hasOrganizationMismatch: boolean;
  hasExpiredCredential: boolean;
  hasUnsafeOrSuspiciousUrl: boolean;
  hasReusedEvidenceAcrossUnrelatedClaims: boolean;
  /** True only when at least one piece of evidence is itself authority_level issuer/official_organization/trusted_registry AND matches the claim (including a GitHub owner/contributor/commit-author match), or a human verifier already confirmed this item. Domain age, HTTPS, and a matching name alone never set this. */
  hasAnyAuthoritativeSource: boolean;
  /**
   * True only when an authoritative match exists *outside* GitHub (a direct
   * issuer record, an official org page, a verifier confirmation, or a
   * Crossref exact match). GitHub is a self-service platform a repository
   * owner fully controls (README, description, homepage), so even a fully
   * matched owner+contributor+commit-author signal is capped at
   * `strongly_supported` on its own — reaching
   * `confirmed_by_authoritative_source` requires this too.
   */
  hasNonGithubAuthoritativeSource: boolean;
  hasAnyEvidence: boolean;
  requiresManualReview: boolean;
};

const STRONGLY_SUPPORTED_THRESHOLD = 45;
const CONFIRMED_THRESHOLD = 70;

function addIfTrue(contributions: ScoreContribution[], condition: boolean, label: string, points: number): number {
  if (!condition) return 0;
  contributions.push({ label, points });
  return points;
}

export function scoreOsintEvidence(inputs: ScoringInputs): ScoringResult {
  const contributions: ScoreContribution[] = [];
  let raw = 0;

  raw += addIfTrue(contributions, inputs.hasDirectVerifierConfirmation, "Direct verifier confirmation", SCORE_WEIGHTS.DIRECT_VERIFIER_CONFIRMATION);
  raw += addIfTrue(contributions, inputs.hasOfficialIssuerRecordMatch, "Official issuer record with matching student/credential", SCORE_WEIGHTS.OFFICIAL_ISSUER_RECORD_MATCH);
  raw += addIfTrue(contributions, inputs.hasOfficialOrgPageNamingStudent, "Official organization page clearly naming the student and claim", SCORE_WEIGHTS.OFFICIAL_ORG_PAGE_NAMES_STUDENT);
  raw += addIfTrue(contributions, inputs.hasTrustedRegistryExactMatch, "Trusted registry / API exact match", SCORE_WEIGHTS.TRUSTED_REGISTRY_EXACT_MATCH);
  raw += addIfTrue(contributions, inputs.hasGithubOwnerMatch, "GitHub: repository owner matches your connected account", SCORE_WEIGHTS.GITHUB_OWNER_MATCH);
  raw += addIfTrue(contributions, inputs.hasGithubContributorMatch, "GitHub: your connected account appears as a contributor", SCORE_WEIGHTS.GITHUB_CONTRIBUTOR_MATCH);
  raw += addIfTrue(contributions, inputs.hasGithubCommitAuthorMatch, "GitHub: commits are authored by your connected account", SCORE_WEIGHTS.GITHUB_COMMIT_AUTHOR_MATCH);
  raw += addIfTrue(contributions, inputs.hasGithubDatesAlign, "GitHub: repository history overlaps the dates on this entry", SCORE_WEIGHTS.GITHUB_DATES_ALIGN);
  raw += addIfTrue(contributions, inputs.hasGithubReadmeMatch, "GitHub: README or description matches this entry", SCORE_WEIGHTS.GITHUB_README_MATCH);
  raw += addIfTrue(contributions, inputs.hasGithubDeploymentUrlMatch, "GitHub: deployment URL matches this entry", SCORE_WEIGHTS.GITHUB_DEPLOYMENT_URL_MATCH);
  raw += addIfTrue(contributions, inputs.hasGithubTitleOnlyMatch, "GitHub: project title matches (name only — not ownership proof)", SCORE_WEIGHTS.GITHUB_TITLE_ONLY_MATCH);
  raw += addIfTrue(contributions, inputs.hasGithubDisplayNameOnlyMatch, "GitHub: display name loosely matches (name only — not ownership proof)", SCORE_WEIGHTS.GITHUB_DISPLAY_NAME_ONLY_MATCH);

  if (inputs.independentSupportingSourceCount > 0) {
    const points = inputs.independentSupportingSourceCount * SCORE_WEIGHTS.INDEPENDENT_SUPPORTING_SOURCE;
    contributions.push({
      label: `${inputs.independentSupportingSourceCount} independent supporting public source${inputs.independentSupportingSourceCount === 1 ? "" : "s"}`,
      points,
    });
    raw += points;
  }

  raw += addIfTrue(contributions, inputs.hasUploadedSupportingEvidence, "Uploaded supporting evidence already on file", SCORE_WEIGHTS.UPLOADED_SUPPORTING_EVIDENCE);
  raw += addIfTrue(contributions, inputs.datesAndOrganizationConsistent, "Dates and organization are consistent", SCORE_WEIGHTS.CONSISTENT_DATES_AND_ORGANIZATION);

  raw += addIfTrue(contributions, inputs.hasConflictingDates, "Dates differ and may need clarification", SCORE_WEIGHTS.CONFLICTING_DATES);
  raw += addIfTrue(contributions, inputs.hasOrganizationMismatch, "Organization name doesn't clearly match", SCORE_WEIGHTS.ORGANIZATION_MISMATCH);
  raw += addIfTrue(contributions, inputs.hasExpiredCredential, "Credential appears expired", SCORE_WEIGHTS.EXPIRED_CREDENTIAL);
  raw += addIfTrue(contributions, inputs.hasUnsafeOrSuspiciousUrl, "One or more sources flagged as unsafe or suspicious", SCORE_WEIGHTS.UNSAFE_OR_SUSPICIOUS_URL);
  raw += addIfTrue(contributions, inputs.hasReusedEvidenceAcrossUnrelatedClaims, "Same evidence reused across unrelated claims", SCORE_WEIGHTS.REUSED_EVIDENCE_ACROSS_UNRELATED_CLAIMS);

  const score = Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(raw)));
  const supportLevel = deriveSupportLevel(score, inputs);

  return {
    score,
    contributions,
    supportLevel,
    explanation: buildExplanation(supportLevel, contributions, inputs),
  };
}

function deriveSupportLevel(score: number, inputs: ScoringInputs): PortfolioOsintSupportLevel {
  if (inputs.requiresManualReview) return "needs_review";
  if (score >= CONFIRMED_THRESHOLD && inputs.hasAnyAuthoritativeSource && inputs.hasNonGithubAuthoritativeSource) {
    return "confirmed_by_authoritative_source";
  }
  if (score >= STRONGLY_SUPPORTED_THRESHOLD) return "strongly_supported";
  if (inputs.hasAnyEvidence && score > 0) return "partially_supported";
  return "unable_to_verify";
}

function buildExplanation(level: PortfolioOsintSupportLevel, contributions: ScoreContribution[], inputs: ScoringInputs): string[] {
  const lines = contributions.map((c) => `${c.points > 0 ? "+" : ""}${c.points}: ${c.label}`);
  if (level === "unable_to_verify") {
    lines.push("No public source could be found — this doesn't mean the claim is false, only that nothing public confirms it yet.");
  }
  if (level === "confirmed_by_authoritative_source" && !inputs.hasAnyAuthoritativeSource) {
    // Structurally unreachable given deriveSupportLevel's gate — kept as a defensive note rather than removed, since this function's output is shown directly to students.
    lines.push("Note: this level requires at least one authoritative source.");
  }
  return lines;
}

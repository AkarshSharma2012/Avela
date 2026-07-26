import type {
  OpportunityApplicationStatus,
  OpportunityDeadlineStatus,
  OpportunityEligibilityDataStatus,
  OpportunitySourceTrustLevel,
  OpportunityVerificationStatus,
} from "@/types/database";

/** Student-facing labels only — never a raw percentage, per the spec ("Do not show a fake percentage to students"). */
export type QualityLabel = "verified" | "needs_review" | "limited_information" | "stale" | "closed";

export type QualityScoreInput = {
  sourceTrustLevel: OpportunitySourceTrustLevel | null;
  hasValidApplicationUrl: boolean;
  deadlineStatus: OpportunityDeadlineStatus;
  applicationStatus: OpportunityApplicationStatus;
  eligibilityStatus: OpportunityEligibilityDataStatus;
  verificationStatus: OpportunityVerificationStatus;
  lastVerifiedAt: string | null;
  /** Number of distinct sources reporting this opportunity (via opportunity_source_links). 0 or 1 = single-sourced. */
  sourceCount: number;
};

export type QualityScoreResult = {
  /** Internal only — never rendered to students directly. */
  score: number;
  label: QualityLabel;
  /** Plain-language factors that contributed, for the review queue / admin tooling, not the student UI. */
  factors: string[];
};

const DAY_MS = 86_400_000;

const TRUST_POINTS: Record<OpportunitySourceTrustLevel, number> = {
  high: 25,
  medium: 15,
  low: 5,
};

/**
 * Builds an explainable internal score (0-100) from concrete, real signals
 * — never an arbitrary/fabricated number — then derives one of five
 * fixed student-facing labels. `closed`/`stale` always win over a high
 * score: the spec's ranking rule ("a high match score must never override
 * expired or ineligible status") applies to quality labeling too, so a
 * well-sourced but closed opportunity is still labeled `closed`, not
 * `verified`.
 */
export function computeQualityScore(
  input: QualityScoreInput,
  now: Date = new Date()
): QualityScoreResult {
  const factors: string[] = [];
  let score = 0;

  const trustPoints = input.sourceTrustLevel ? TRUST_POINTS[input.sourceTrustLevel] : 0;
  score += trustPoints;
  if (input.sourceTrustLevel === "high") factors.push("Official/high-trust source");

  if (input.hasValidApplicationUrl) {
    score += 15;
    factors.push("Application link verified");
  }

  if (input.deadlineStatus === "open" || input.deadlineStatus === "rolling") {
    score += 20;
    factors.push("Current or rolling deadline");
  } else if (input.deadlineStatus === "upcoming") {
    score += 10;
  }

  if (input.eligibilityStatus === "defined") {
    score += 15;
    factors.push("Complete eligibility information");
  } else if (input.eligibilityStatus === "partially_defined") {
    score += 7;
  }

  if (input.lastVerifiedAt) {
    const daysSince = (now.getTime() - new Date(input.lastVerifiedAt).getTime()) / DAY_MS;
    if (daysSince <= 30) {
      score += 15;
      factors.push("Verified recently");
    } else if (daysSince <= 90) {
      score += 7;
    }
  }

  if (input.sourceCount > 1) {
    score += 10;
    factors.push("Consistent across multiple sources");
  }

  score = Math.max(0, Math.min(100, score));

  return { score, label: deriveLabel(input, score), factors };
}

function deriveLabel(input: QualityScoreInput, score: number): QualityLabel {
  if (input.deadlineStatus === "closed" || input.applicationStatus === "closed") return "closed";
  if (input.verificationStatus === "rejected") return "closed";
  if (input.verificationStatus === "stale") return "stale";
  if (input.verificationStatus === "verified" && score >= 70) return "verified";
  if (score < 40) return "limited_information";
  return "needs_review";
}

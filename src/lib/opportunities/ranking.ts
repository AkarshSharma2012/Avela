import type { EligibilityStatus } from "@/lib/opportunities/eligibility-engine";
import type { MatchTier } from "@/lib/opportunities/matching";
import type {
  OpportunityApplicationStatus,
  OpportunityDeadlineStatus,
  OpportunityVerificationStatus,
} from "@/types/database";

export type RankingInput = {
  id: string;
  eligibilityStatus: EligibilityStatus;
  deadlineStatus: OpportunityDeadlineStatus;
  applicationStatus: OpportunityApplicationStatus;
  verificationStatus: OpportunityVerificationStatus;
  matchTier: MatchTier;
  applicationDeadline: string | null;
  weeklyCommitmentHours: number | null;
  studentMaxWeeklyHours: number | null;
  /** `true`/`false` when a preference is known and can be compared; `null` when there's nothing to compare against (never penalized). */
  costPreferenceMatch: boolean | null;
  formatPreferenceMatch: boolean | null;
  hasCompleteInformation: boolean;
};

export type RankedResult<T extends RankingInput> = {
  opportunity: T;
  rank: number;
  /** Short, student-facing reasons this result ranked where it did — never a raw score. */
  explanation: string[];
};

const FAR_FUTURE_DAYS = 3650;

function deadlineUrgency(input: RankingInput, now: Date): number {
  if (input.deadlineStatus === "open" && input.applicationDeadline) {
    const daysUntil = (new Date(input.applicationDeadline).getTime() - now.getTime()) / 86_400_000;
    return Math.max(0, Math.min(FAR_FUTURE_DAYS, daysUntil));
  }
  if (input.deadlineStatus === "upcoming") return FAR_FUTURE_DAYS + 1;
  if (input.deadlineStatus === "rolling") return FAR_FUTURE_DAYS + 2;
  return FAR_FUTURE_DAYS + 3; // unknown
}

function buildSortKey(input: RankingInput, now: Date): number[] {
  const eligibilityRank = { eligible: 0, likely_eligible: 1, unclear: 2, ineligible: 3 }[
    input.eligibilityStatus
  ];
  const acceptingRank =
    input.applicationStatus === "accepting_applications"
      ? 0
      : input.applicationStatus === "opening_soon"
        ? 1
        : 2;
  const verifiedRank =
    input.verificationStatus === "verified" ? 0 : input.verificationStatus === "partially_verified" ? 1 : 2;
  const matchTierRank = { strong_fit: 0, possible_fit: 1, limited_fit: 2 }[input.matchTier];
  const commitmentRank =
    input.weeklyCommitmentHours !== null &&
    input.studentMaxWeeklyHours !== null &&
    input.weeklyCommitmentHours > input.studentMaxWeeklyHours
      ? 1
      : 0;
  const costFormatRank =
    input.costPreferenceMatch === false || input.formatPreferenceMatch === false ? 1 : 0;
  const completeInfoRank = input.hasCompleteInformation ? 0 : 1;

  return [
    eligibilityRank,
    acceptingRank,
    verifiedRank,
    matchTierRank,
    deadlineUrgency(input, now),
    commitmentRank,
    costFormatRank,
    completeInfoRank,
  ];
}

function compareSortKeys(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function explain(input: RankingInput): string[] {
  const explanation: string[] = [];
  if (input.eligibilityStatus === "eligible" && input.applicationStatus === "accepting_applications") {
    explanation.push("Eligible and accepting applications");
  }
  if (input.verificationStatus === "verified") explanation.push("Verified listing");
  if (input.matchTier === "strong_fit") explanation.push("Strong profile match");
  if (input.deadlineStatus === "open" && input.applicationDeadline) {
    explanation.push("Deadline approaching");
  }
  if (explanation.length === 0) explanation.push("Meets your basic search criteria");
  return explanation;
}

/**
 * Deterministic ranking pipeline per the spec's seven priorities. Expired
 * (`deadline_status: closed`) and clearly ineligible opportunities are
 * excluded entirely rather than merely sorted last — the spec says "never
 * rank" them, not "rank them lowest". Unknown eligibility (`unclear`)
 * still ranks below known-eligible results via `eligibilityRank`, per
 * "unknown eligibility should rank below verified eligibility."
 */
export function rankOpportunities<T extends RankingInput>(
  opportunities: readonly T[],
  now: Date = new Date()
): RankedResult<T>[] {
  const rankable = opportunities.filter(
    (o) => o.deadlineStatus !== "closed" && o.eligibilityStatus !== "ineligible"
  );

  const sorted = [...rankable].sort((a, b) => {
    const cmp = compareSortKeys(buildSortKey(a, now), buildSortKey(b, now));
    return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
  });

  return sorted.map((opportunity, index) => ({
    opportunity,
    rank: index + 1,
    explanation: explain(opportunity),
  }));
}

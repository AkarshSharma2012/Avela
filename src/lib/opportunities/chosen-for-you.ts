import { evaluateEligibility, type EligibilityResult } from "@/lib/opportunities/eligibility-engine";
import {
  matchOpportunity,
  WEEKLY_AVAILABILITY_MAX_HOURS,
  type MatchProfileInput,
  type MatchResult,
} from "@/lib/opportunities/matching";
import { rankOpportunities, type RankingInput } from "@/lib/opportunities/ranking";
import type { Opportunity } from "@/types/opportunity";

/** How many opportunities the very first page shows: one featured plus this many more. */
const INITIAL_ADDITIONAL_COUNT = 3;

/** How many opportunities each "Find more" click reveals — smaller than the first page since there's no featured slot to fill. */
const FIND_MORE_BATCH_SIZE = 3;

export type ChosenForYouEntry = {
  opportunity: Opportunity;
  matchResult: MatchResult;
  eligibilityResult: EligibilityResult;
};

export type ChosenForYouStatus =
  /** No eligible opportunity exists for this profile at all — not even a first batch. */
  | "empty"
  /** This batch was the last one; nothing more to show. */
  | "exhausted"
  /** More remain, but every one of them is only a `limited_fit` — worth flagging honestly before the student clicks "Find more" again. */
  | "only_broader_remaining"
  /** More remain, including at least one `possible_fit` or `strong_fit`. */
  | "has_more";

export type ChosenForYouBatch = {
  /** Only present on the first page (`shown === 0`) — the single strongest match. */
  featured: ChosenForYouEntry | null;
  /** The rest of this batch (up to 3 on the first page, up to 3 per "Find more" click after that). */
  additional: ChosenForYouEntry[];
  status: ChosenForYouStatus;
  /** The `shown` value the next "Find more" click should request, or `null` when there's nothing more. */
  nextShown: number | null;
};

/** Combines a ranking input with the real row and results it was computed from, so a `RankedResult` can be turned back into a `ChosenForYouEntry` after sorting. */
type Candidate = RankingInput & {
  record: Opportunity;
  matchResult: MatchResult;
  eligibilityResult: EligibilityResult;
};

/** Exported for reuse by discovery.ts — the same opportunity→eligibility-input mapping, never a second copy. */
export function toEligibilityOpportunityInput(opportunity: Opportunity) {
  return {
    minGrade: opportunity.min_grade,
    maxGrade: opportunity.max_grade,
    deadlineStatus: opportunity.deadline_status,
    applicationStatus: opportunity.application_status,
    residencyRequirements: opportunity.residency_requirements,
    citizenshipRequirements: opportunity.citizenship_requirements,
    weeklyCommitmentHours: opportunity.weekly_commitment_hours,
  };
}

/** `true`/`false` only when the student expressed a cost preference; `null` (never penalized) otherwise — mirrors matching.ts's own free_only comparison. Exported for reuse by discovery.ts's ranking of freshly-discovered candidates, so the two never compute this signal two different ways. */
export function computeCostPreferenceMatch(
  profile: MatchProfileInput,
  opportunity: Opportunity
): boolean | null {
  if (!profile.preferences.includes("free_only")) return null;
  return opportunity.cost_type === "free";
}

/** `true`/`false` only when the student expressed a format preference; `null` otherwise — mirrors matching.ts's own virtual/in_person comparison. Exported for reuse by discovery.ts. */
export function computeFormatPreferenceMatch(
  profile: MatchProfileInput,
  opportunity: Opportunity
): boolean | null {
  const wantsVirtual = profile.preferences.includes("virtual");
  const wantsInPerson = profile.preferences.includes("in_person");
  if (!wantsVirtual && !wantsInPerson) return null;

  const fitsVirtual = opportunity.format === "virtual" || opportunity.format === "hybrid";
  const fitsInPerson = opportunity.format === "in_person" || opportunity.format === "hybrid";

  if (wantsVirtual && wantsInPerson) return fitsVirtual || fitsInPerson;
  if (wantsVirtual) return fitsVirtual;
  return fitsInPerson;
}

/** A listing counts as having complete information when its deadline, application status, and eligibility criteria have all actually been resolved — never a fabricated signal, just a read of real columns. Exported for reuse by discovery.ts. */
export function hasCompleteInformation(opportunity: Opportunity): boolean {
  return (
    opportunity.deadline_status !== "unknown" &&
    opportunity.application_status !== "unknown" &&
    opportunity.eligibility_status === "defined"
  );
}

function toCandidate(opportunity: Opportunity, profile: MatchProfileInput): Candidate {
  const matchResult = matchOpportunity(opportunity, profile);
  const eligibilityResult = evaluateEligibility(toEligibilityOpportunityInput(opportunity), {
    gradeLevel: profile.gradeLevel,
    state: profile.state,
    weeklyAvailability: profile.weeklyAvailability,
  });

  const studentMaxWeeklyHours =
    profile.weeklyAvailability !== null ? WEEKLY_AVAILABILITY_MAX_HOURS[profile.weeklyAvailability] : null;

  return {
    id: opportunity.id,
    eligibilityStatus: eligibilityResult.status,
    deadlineStatus: opportunity.deadline_status,
    applicationStatus: opportunity.application_status,
    verificationStatus: opportunity.verification_status,
    matchTier: matchResult.tier,
    applicationDeadline: opportunity.application_deadline,
    weeklyCommitmentHours: opportunity.weekly_commitment_hours,
    studentMaxWeeklyHours,
    costPreferenceMatch: computeCostPreferenceMatch(profile, opportunity),
    formatPreferenceMatch: computeFormatPreferenceMatch(profile, opportunity),
    hasCompleteInformation: hasCompleteInformation(opportunity),
    record: opportunity,
    matchResult,
    eligibilityResult,
  };
}

function toEntry(candidate: Candidate): ChosenForYouEntry {
  return {
    opportunity: candidate.record,
    matchResult: candidate.matchResult,
    eligibilityResult: candidate.eligibilityResult,
  };
}

/**
 * Builds one page of the "Chosen for You" feed: rank the student's full
 * eligible-opportunity pool once (matching + eligibility + the existing
 * deterministic ranker), then slice it by `shown` — a plain offset into
 * that same stable order, exactly like the Opportunities page's own
 * pagination. Because the order is deterministic (stable id tiebreak, no
 * randomness), advancing the offset on every "Find more" click can never
 * repeat an opportunity already shown in an earlier batch, with no
 * database table or session state required.
 *
 * `opportunities` should already be the active, non-sample pool (see
 * `listOpportunitiesForMatching`) — `is_sample` is still filtered here too,
 * defensively, so this function is safe to call with any pool.
 */
export function buildChosenForYou(
  opportunities: readonly Opportunity[],
  profile: MatchProfileInput,
  shown: number,
  now: Date = new Date()
): ChosenForYouBatch {
  const candidates = opportunities.filter((opportunity) => !opportunity.is_sample).map((opportunity) => toCandidate(opportunity, profile));

  const ranked = rankOpportunities(candidates, now);
  const total = ranked.length;

  if (total === 0) {
    return { featured: null, additional: [], status: "empty", nextShown: null };
  }

  const offset = Math.max(0, shown);
  const isFirstPage = offset === 0;
  const takeCount = isFirstPage ? 1 + INITIAL_ADDITIONAL_COUNT : FIND_MORE_BATCH_SIZE;
  const batch = ranked.slice(offset, offset + takeCount);

  if (batch.length === 0) {
    return { featured: null, additional: [], status: "exhausted", nextShown: null };
  }

  const featured = isFirstPage ? toEntry(batch[0].opportunity) : null;
  const additional = (isFirstPage ? batch.slice(1) : batch).map((result) => toEntry(result.opportunity));

  const consumed = offset + batch.length;
  const remaining = ranked.slice(consumed);

  let status: ChosenForYouStatus;
  let nextShown: number | null;

  if (remaining.length === 0) {
    status = "exhausted";
    nextShown = null;
  } else if (remaining.every((result) => result.opportunity.matchTier === "limited_fit")) {
    status = "only_broader_remaining";
    nextShown = consumed;
  } else {
    status = "has_more";
    nextShown = consumed;
  }

  return { featured, additional, status, nextShown };
}

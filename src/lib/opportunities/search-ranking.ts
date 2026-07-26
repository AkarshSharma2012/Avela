import type { OpportunityApplicationStatus, OpportunityVerificationLabel } from "@/types/database";

/**
 * Deterministic free-text search relevance (Milestone 7 spec section 13)
 * — plain, explainable point additions from real signal matches, never a
 * semantic/ML model. Do not call this "AI search" anywhere in the UI —
 * see the spec's explicit instruction. Used only when a student has
 * typed a search term (`filters.q`); with no search term, `query.ts`
 * keeps its existing deadline/created-at ordering unchanged.
 */

export type SearchRelevanceInput = {
  title: string;
  organization: string;
  description: string;
  interestTags: readonly string[];
  opportunityType: string;
  locationText: string | null;
  verificationLabel: OpportunityVerificationLabel;
  applicationStatus: OpportunityApplicationStatus;
};

const VERIFICATION_LABEL_POINTS: Record<OpportunityVerificationLabel, number> = {
  verified_accepting: 20,
  verified_opening_soon: 15,
  verified_next_cycle: 12,
  partially_verified_deadline_unclear: 5,
  needs_review: 0,
  stale: -10,
  closed: -50,
};

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * Higher is more relevant. `query` and `profileInterestTags` are always
 * plain, already-known values — never a generated embedding — so every
 * point added is traceable to an exact-title-match / org-match /
 * tag-overlap / keyword-match / verification-quality signal, per the
 * spec's explicit list.
 */
export function computeSearchRelevance(
  opportunity: SearchRelevanceInput,
  query: string,
  profileInterestTags: readonly string[] = []
): number {
  const q = normalize(query);
  let score = 0;

  if (q.length > 0) {
    const title = normalize(opportunity.title);
    const organization = normalize(opportunity.organization);
    const description = normalize(opportunity.description);

    if (title === q) score += 100;
    else if (title.includes(q)) score += 50;

    if (organization.includes(q)) score += 30;

    if (opportunity.interestTags.some((tag) => normalize(tag) === q)) score += 40;

    if (description.includes(q)) score += 15;

    if (normalize(opportunity.opportunityType).includes(q)) score += 10;
    if (opportunity.locationText && normalize(opportunity.locationText).includes(q)) score += 10;
  }

  const matchedProfileTags = opportunity.interestTags.filter((tag) =>
    profileInterestTags.some((profileTag) => normalize(profileTag) === normalize(tag))
  ).length;
  score += matchedProfileTags * 5;

  score += VERIFICATION_LABEL_POINTS[opportunity.verificationLabel] ?? 0;
  if (opportunity.applicationStatus === "accepting_applications") score += 5;

  return score;
}

export type RelevanceRankable = { id: string } & SearchRelevanceInput;

/** Sorts by relevance score descending, `id` as a deterministic tiebreaker — never a random/unstable order for equally-relevant results. */
export function sortByRelevance<T extends RelevanceRankable>(
  items: readonly T[],
  query: string,
  profileInterestTags: readonly string[] = []
): T[] {
  return [...items].sort((a, b) => {
    const diff = computeSearchRelevance(b, query, profileInterestTags) - computeSearchRelevance(a, query, profileInterestTags);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
}

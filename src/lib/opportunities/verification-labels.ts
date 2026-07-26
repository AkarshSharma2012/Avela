import type {
  OpportunityApplicationStatus,
  OpportunityDeadlineStatus,
  OpportunitySourceTrustLevel,
  OpportunityVerificationLabel,
} from "@/types/database";

/**
 * Seven specific, evidence-driven verification labels (Milestone 7 spec
 * section 5) — replaces a single generic "Unverified" badge for every
 * situation. Distinct from `verification_status` (Milestone 5's coarse
 * gate `query.ts`/`ranking.ts` already depend on) — `ingestion-runner.ts`
 * computes both independently from their own inputs rather than deriving
 * one from the other, so `verification_status`'s existing formula is
 * genuinely unchanged, not re-expressed through a lossy mapping.
 */

const DAY_MS = 86_400_000;
/** How old `last_verified_at` can be before a listing's *label* downgrades to `stale`, distinct from `review-queue.ts`'s 30-day *source*-level staleness check — a listing re-verified every recheck cycle rarely reaches this. */
const STALE_LABEL_DAYS = 120;

export type VerificationLabelInput = {
  sourceTrustLevel: OpportunitySourceTrustLevel | null;
  applicationUrlOk: boolean;
  /** True when grade/age eligibility is confidently known (or explicitly "all grades") — mirrors `eligibility_status === 'defined'`. */
  gradeEligibilityClear: boolean;
  deadlineStatus: OpportunityDeadlineStatus;
  /** Already-merged application status (phrase-detection result folded with the deadline-derived fallback — see `ingestion-runner.ts`). */
  applicationStatus: OpportunityApplicationStatus;
  isRolling: boolean;
  isNextCycleAnnounced: boolean;
  hasUnresolvedConflict: boolean;
  lastVerifiedAt: string | null;
};

/**
 * `closed` always wins (a well-sourced but closed opportunity is still
 * `closed`, never `verified_*` — same "expired/ineligible never
 * outranked" rule `quality.ts` already applies to its own label).
 * `stale` wins next. An unresolved cross-source conflict caps everything
 * else at `needs_review`, regardless of how otherwise well-qualified the
 * record is — section 9's "prevent Verified status until material
 * conflicts are resolved". Only past those gates does a record qualify
 * for one of the three `verified_*` labels, which require a high-trust
 * source, a working application link, and clear grade eligibility —
 * "exact deadline not yet announced" alone never blocks `verified_*`, as
 * long as the phrase-detected application-status signal (accepting /
 * next-cycle-announced / opening-soon) is itself confident.
 */
export function computeVerificationLabel(
  input: VerificationLabelInput,
  now: Date = new Date()
): OpportunityVerificationLabel {
  if (input.deadlineStatus === "closed" || input.applicationStatus === "closed") {
    return "closed";
  }

  const daysSinceVerified = input.lastVerifiedAt
    ? (now.getTime() - new Date(input.lastVerifiedAt).getTime()) / DAY_MS
    : null;
  if (daysSinceVerified !== null && daysSinceVerified > STALE_LABEL_DAYS) {
    return "stale";
  }

  if (input.hasUnresolvedConflict) {
    return "needs_review";
  }

  const baseQualified =
    input.sourceTrustLevel === "high" && input.applicationUrlOk && input.gradeEligibilityClear;
  if (!baseQualified) {
    return "needs_review";
  }

  if (input.applicationStatus === "accepting_applications" || input.isRolling) {
    return "verified_accepting";
  }
  if (input.isNextCycleAnnounced) {
    return "verified_next_cycle";
  }
  if (input.applicationStatus === "opening_soon") {
    return "verified_opening_soon";
  }
  if (input.deadlineStatus === "open" || input.deadlineStatus === "rolling") {
    return "verified_accepting";
  }
  if (input.deadlineStatus === "upcoming") {
    return "verified_opening_soon";
  }

  return "partially_verified_deadline_unclear";
}

export const VERIFICATION_LABEL_TEXT: Record<OpportunityVerificationLabel, string> = {
  verified_accepting: "Verified — accepting applications",
  verified_opening_soon: "Verified — opening soon",
  verified_next_cycle: "Verified — next cycle announced",
  partially_verified_deadline_unclear: "Partially verified — deadline unclear",
  needs_review: "Needs review",
  closed: "Closed",
  stale: "Stale",
};

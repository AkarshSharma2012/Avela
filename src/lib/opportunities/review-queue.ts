import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/opportunities/extraction";
import type {
  OpportunityApplicationStatus,
  OpportunityDeadlineStatus,
  OpportunityReviewQueueReason,
} from "@/types/database";

export type ReviewCheckInput = {
  deadlineStatus: OpportunityDeadlineStatus;
  applicationStatus: OpportunityApplicationStatus;
  hasConflictingSourceInfo: boolean;
  isProbableDuplicate: boolean;
  /** 0-100, or `null` if grade wasn't extracted from free text at all (e.g. entered directly). */
  gradeExtractionConfidence: number | null;
  /** `null` = not checked yet (not itself a reason for review); `false` = confirmed unreachable. */
  applicationUrlReachable: boolean | null;
  /** Days since the owning source was last successfully checked, or `null` if never checked. */
  daysSinceSourceSuccess: number | null;
  hasResidencyOrCitizenshipAmbiguity: boolean;
};

export type ReviewCheckResult = {
  needsReview: boolean;
  reasons: OpportunityReviewQueueReason[];
};

const STALE_SOURCE_DAYS = 30;

/**
 * Pure decision function for the section-14 admin review queue foundation
 * — this is what a (future) ingestion/verification job calls to decide
 * whether a record needs a `opportunity_review_queue` row, and with which
 * reason(s). Kept dependency-free (no Supabase client) so it's unit
 * testable the same way as the rest of this milestone's engines.
 */
export function evaluateReviewNeed(input: ReviewCheckInput): ReviewCheckResult {
  const reasons: OpportunityReviewQueueReason[] = [];

  if (input.deadlineStatus === "unknown") reasons.push("unknown_deadline");
  if (input.hasConflictingSourceInfo) reasons.push("conflicting_sources");
  if (input.isProbableDuplicate) reasons.push("probable_duplicate");
  if (input.gradeExtractionConfidence !== null && input.gradeExtractionConfidence < LOW_CONFIDENCE_THRESHOLD) {
    reasons.push("low_confidence_grade");
  }
  if (input.applicationStatus === "unknown") reasons.push("unclear_application_status");
  if (input.applicationUrlReachable === false) reasons.push("broken_application_url");
  if (input.daysSinceSourceSuccess !== null && input.daysSinceSourceSuccess > STALE_SOURCE_DAYS) {
    reasons.push("stale_source");
  }
  if (input.hasResidencyOrCitizenshipAmbiguity) reasons.push("residency_citizenship_ambiguity");

  return { needsReview: reasons.length > 0, reasons };
}

export type ReviewQueueEntryDraft = {
  opportunity_id: string | null;
  raw_record_id: string | null;
  reason: OpportunityReviewQueueReason;
  details: string | null;
};

/** Expands one review check result into the individual rows a caller would insert into `opportunity_review_queue` — one row per reason, so each can be resolved/dismissed independently. */
export function buildReviewQueueEntries(
  target: { opportunityId: string | null; rawRecordId: string | null },
  result: ReviewCheckResult,
  details?: string
): ReviewQueueEntryDraft[] {
  return result.reasons.map((reason) => ({
    opportunity_id: target.opportunityId,
    raw_record_id: target.rawRecordId,
    reason,
    details: details ?? null,
  }));
}

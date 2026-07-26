import type { RawOpportunityRecordInput } from "@/lib/opportunities/adapters/types";
import type { ExtractedField } from "@/lib/opportunities/extraction";
import type {
  OpportunityApplicationStatus,
  OpportunityCostType,
  OpportunityDeadlineStatus,
  OpportunityEligibilityDataStatus,
  OpportunityExtendedDetails,
  OpportunityFormat,
  OpportunityReviewQueueReason,
  OpportunitySourceTrustLevel,
  OpportunityType,
  OpportunityVerificationLabel,
  OpportunityVerificationStatus,
} from "@/types/database";

/** A slice of an existing `opportunities` row plus its primary source's trust level — everything `ingestion-runner.ts` needs to run `dedupe.ts`/`conflicts.ts` against it and decide how to merge. */
export type DedupeCandidateRow = {
  id: string;
  title: string;
  organization: string;
  canonicalUrl: string | null;
  applicationUrl: string;
  sourceUrl: string | null;
  applicationDeadline: string | null;
  minGrade: number | null;
  maxGrade: number | null;
  primarySourceId: string | null;
  primarySourceTrustLevel: OpportunitySourceTrustLevel | null;
  sourceLinkCount: number;
};

export type NewOpportunityFields = {
  title: string;
  organization: string;
  description: string;
  opportunity_type: OpportunityType;
  format: OpportunityFormat;
  cost_type: OpportunityCostType;
  cost_amount: number | null;
  min_grade: number | null;
  max_grade: number | null;
  weekly_commitment_hours: number | null;
  application_deadline: string | null;
  application_url: string;
  source_url: string | null;
  source_id: string;
  verification_status: OpportunityVerificationStatus;
  verification_confidence: number;
  deadline_status: OpportunityDeadlineStatus;
  eligibility_status: OpportunityEligibilityDataStatus;
  application_status: OpportunityApplicationStatus;
  last_verified_at: string;
  next_verification_at: string;
  is_verified: boolean;
  residency_requirements: string | null;
  citizenship_requirements: string | null;
  // Milestone 7 — verification label, status intelligence, conflicts, and deep detail
  verification_label: OpportunityVerificationLabel;
  has_unresolved_conflict: boolean;
  application_opens_at: string | null;
  application_closes_at: string | null;
  status_evidence: string | null;
  status_checked_at: string | null;
  age_min: number | null;
  age_max: number | null;
  school_enrollment_required: boolean | null;
  stipend_amount: number | null;
  hourly_pay: number | null;
  financial_aid_available: boolean | null;
  transportation_support: boolean | null;
  housing_support: boolean | null;
  essay_required: boolean | null;
  recommendation_required: boolean | null;
  transcript_required: boolean | null;
  interview_required: boolean | null;
  parent_consent_required: boolean | null;
  schedule_text: string | null;
  attendance_requirements: string | null;
  application_contact: string | null;
  notification_date: string | null;
  extended_details: OpportunityExtendedDetails;
};

export type OpportunityPatch = Partial<NewOpportunityFields>;

/** One `opportunity_field_evidence` row to persist — see supabase/migrations/20260728000000_opportunity_evidence_and_verification.sql. */
export type FieldEvidenceDraft = {
  fieldName: string;
  entry: ExtractedField<unknown>;
  sourceUrl: string | null;
};

/**
 * Everything `runIngestion` needs to persist its work, expressed as an
 * interface rather than a raw Supabase client — the same
 * dependency-injection pattern `query.ts`/`save.ts` already use, so the
 * runner's actual decision logic (validate/dedupe/merge) is unit-testable
 * against a fake in-memory implementation, with no real database or
 * network involved. `supabase-repository.ts` is the one real
 * implementation, used only by the CLI script.
 */
export interface IngestionRepository {
  createIngestionRun(sourceId: string, startedAt: string): Promise<string>;
  completeIngestionRun(
    runId: string,
    result: {
      status: "completed" | "failed";
      itemsFound: number;
      itemsCreated: number;
      itemsUpdated: number;
      itemsRejected: number;
      errorSummary: string | null;
    }
  ): Promise<void>;
  insertRawRecord(input: {
    sourceId: string;
    ingestionRunId: string;
    record: RawOpportunityRecordInput;
    processingStatus: "processed" | "rejected" | "duplicate";
    processingError: string | null;
  }): Promise<void>;
  /** A narrow, indexable lookup (by organization/application URL) — never the whole table — for the dedupe step to compare against. */
  findDedupeCandidates(signals: {
    organization: string;
    applicationUrl: string;
  }): Promise<DedupeCandidateRow[]>;
  insertOpportunity(fields: NewOpportunityFields): Promise<string>;
  updateOpportunity(id: string, patch: OpportunityPatch): Promise<void>;
  upsertSourceLink(input: {
    opportunityId: string;
    sourceId: string;
    sourceUrl: string;
    isPrimary: boolean;
  }): Promise<void>;
  insertReviewQueueEntries(
    entries: { opportunityId: string; reason: OpportunityReviewQueueReason }[]
  ): Promise<void>;
  /** Persists the structured evidence trail (section 4) backing every deep-extraction field an ingestion pass found — never called with an empty array's worth of fabricated entries, only real extractor output. */
  insertFieldEvidence(opportunityId: string, evidence: FieldEvidenceDraft[]): Promise<void>;
}

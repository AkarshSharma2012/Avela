import type { RawOpportunityRecordInput } from "@/lib/opportunities/adapters/types";
import type {
  OpportunityApplicationStatus,
  OpportunityCostType,
  OpportunityDeadlineStatus,
  OpportunityEligibilityDataStatus,
  OpportunityFormat,
  OpportunityReviewQueueReason,
  OpportunitySourceTrustLevel,
  OpportunityType,
  OpportunityVerificationStatus,
} from "@/types/database";

/** A slice of an existing `opportunities` row plus its primary source's trust level — everything `ingestion-runner.ts` needs to run `dedupe.ts` against it and decide how to merge. */
export type DedupeCandidateRow = {
  id: string;
  title: string;
  organization: string;
  canonicalUrl: string | null;
  applicationUrl: string;
  sourceUrl: string | null;
  applicationDeadline: string | null;
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
};

export type OpportunityPatch = Partial<NewOpportunityFields>;

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
}

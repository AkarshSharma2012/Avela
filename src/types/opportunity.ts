// Backed by public.opportunities / public.saved_opportunities — see
// supabase/migrations/20260726000000_create_opportunities.sql and
// docs/database.md. Re-exports the enum types from database.ts rather than
// redeclaring them, so the two can never silently drift apart.

import type { Database } from "@/types/database";

export type {
  OpportunityType,
  OpportunityFormat,
  OpportunityCostType,
  OpportunitySourceType,
  OpportunitySourceTrustLevel,
  OpportunitySourceCrawlMethod,
  OpportunityIngestionRunStatus,
  RawOpportunityProcessingStatus,
  OpportunityVerificationStatus,
  OpportunityDeadlineStatus,
  OpportunityEligibilityDataStatus,
  OpportunityApplicationStatus,
  OpportunityReviewQueueReason,
  OpportunityReviewQueueStatus,
} from "@/types/database";

export type Opportunity = Database["public"]["Tables"]["opportunities"]["Row"];

export type SavedOpportunity =
  Database["public"]["Tables"]["saved_opportunities"]["Row"];

export type OpportunitySource = Database["public"]["Tables"]["opportunity_sources"]["Row"];

export type OpportunityIngestionRun =
  Database["public"]["Tables"]["opportunity_ingestion_runs"]["Row"];

export type RawOpportunityRecord =
  Database["public"]["Tables"]["raw_opportunity_records"]["Row"];

export type OpportunitySourceLink =
  Database["public"]["Tables"]["opportunity_source_links"]["Row"];

export type OpportunityReviewQueueEntry =
  Database["public"]["Tables"]["opportunity_review_queue"]["Row"];

/** An opportunity annotated with whether the current student has saved it. */
export type OpportunityWithSaved = Opportunity & { isSaved: boolean };

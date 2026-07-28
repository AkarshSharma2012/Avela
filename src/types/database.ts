// Hand-written to match supabase/migrations/20260725000000_create_profiles.sql
// and supabase/migrations/20260725010000_onboarding_expansion.sql.
// Once the Supabase CLI is linked to a project, regenerate with:
//   npx supabase gen types typescript --local > src/types/database.ts

export type WeeklyAvailability =
  | "less_than_2"
  | "2_to_5"
  | "5_to_10"
  | "more_than_10"
  | "varies"
  | "not_sure";

export type ExperienceLevel =
  | "beginner"
  | "some_experience"
  | "experienced"
  | "not_sure";

export type InterestValue =
  | "Business"
  | "Entrepreneurship"
  | "Technology"
  | "Computer Science"
  | "Engineering"
  | "Medicine"
  | "Public Health"
  | "Psychology"
  | "Law"
  | "Government"
  | "Environmental Science"
  | "Biology"
  | "Mathematics"
  | "Writing"
  | "Journalism"
  | "Visual Arts"
  | "Music"
  | "Theater"
  | "Filmmaking"
  | "Sports"
  | "Education"
  | "Community Service"
  | "Finance"
  | "Design"
  | "Not sure yet"
  | "Other";

export type GoalValue =
  | "Explore my interests"
  | "Build a resume"
  | "Find volunteer work"
  | "Find a summer program"
  | "Prepare for college"
  | "Gain leadership experience"
  | "Enter competitions"
  | "Find an internship"
  | "Explore research"
  | "Improve a skill"
  | "Complete a personal project";

export type OpportunityPreferenceKey =
  | "virtual"
  | "in_person"
  | "either"
  | "free_only"
  | "paid_ok"
  | "local"
  | "national"
  | "short_term"
  | "year_round"
  | "summer"
  | "beginner_friendly"
  | "advanced";

// Milestone 4 — public.opportunities / public.saved_opportunities

export type OpportunityType =
  | "internship"
  | "competition"
  | "volunteer"
  | "summer_program"
  | "research"
  | "scholarship"
  | "club";

export type OpportunityFormat = "virtual" | "in_person" | "hybrid";

export type OpportunityCostType = "free" | "paid";

// Milestone 5 — discovery, verification, and ranking

export type OpportunitySourceType =
  | "official_organization"
  | "government"
  | "university"
  | "nonprofit"
  | "school_district"
  | "verified_directory"
  | "rss_feed"
  | "api"
  | "manual_source";

export type OpportunitySourceTrustLevel = "high" | "medium" | "low";

export type OpportunitySourceCrawlMethod =
  | "manual_import"
  | "csv_import"
  | "rss_feed"
  | "api"
  | "static_adapter"
  | "html_scrape"
  | "listing_scrape";

export type OpportunityIngestionRunStatus = "running" | "completed" | "failed";

export type RawOpportunityProcessingStatus = "pending" | "processed" | "rejected" | "duplicate";

export type OpportunityVerificationStatus =
  | "unverified"
  | "partially_verified"
  | "verified"
  | "stale"
  | "rejected";

export type OpportunityDeadlineStatus = "open" | "rolling" | "upcoming" | "closed" | "unknown";

/** Whether this listing's eligibility *criteria* are known — not a per-student outcome. See src/types/opportunity.ts. */
export type OpportunityEligibilityDataStatus = "defined" | "partially_defined" | "undefined";

export type OpportunityApplicationStatus =
  | "accepting_applications"
  | "opening_soon"
  | "closed"
  | "unknown";

export type OpportunityReviewQueueReason =
  | "unknown_deadline"
  | "conflicting_sources"
  | "probable_duplicate"
  | "low_confidence_grade"
  | "unclear_application_status"
  | "broken_application_url"
  | "stale_source"
  | "residency_citizenship_ambiguity"
  | "new_cycle_unconfirmed";

export type OpportunityReviewQueueStatus = "open" | "resolved" | "dismissed";

// Milestone 7 — source expansion, deep detail extraction, and verification

/**
 * Seven specific, student-facing verification states (spec section 5) —
 * replaces a single vague "Unverified" badge for every situation. See
 * src/lib/opportunities/verification-labels.ts. `verification_status`
 * (above) is kept unchanged for backward compatibility with
 * Milestones 4-6 code/tests and is derived from this finer label.
 */
export type OpportunityVerificationLabel =
  | "verified_accepting"
  | "verified_opening_soon"
  | "verified_next_cycle"
  | "partially_verified_deadline_unclear"
  | "needs_review"
  | "closed"
  | "stale";

/** Long-tail deep-extraction fields with no dedicated column — see opportunities.extended_details. Every key optional; a missing key means "not found," never "no." Each value is stored alongside a matching `opportunity_field_evidence` row carrying its confidence/evidence/method. */
export type OpportunityExtendedDetails = {
  demographic_restrictions?: string;
  prerequisites?: string;
  required_experience?: string;
  required_documents?: string[];
  application_steps?: string[];
  skills?: string[];
  expected_outcomes?: string;
  certificate_or_credit?: string;
  program_benefits?: string;
};

/** Mirrors extraction.ts's `ExtractionMethod` — duplicated here (not imported) since types/database.ts is hand-written to mirror the schema alone, importing nothing from src/lib. */
export type OpportunityFieldEvidenceExtractionMethod =
  | "html_metadata"
  | "json_ld"
  | "open_graph"
  | "structured_api"
  | "llm_assisted"
  | "manual";

// Fresh Profile-Based Discovery

/** Real phases a "Find more" fresh-discovery run actually passes through — see src/lib/opportunities/discovery.ts. */
export type StudentDiscoveryRunStatus =
  | "pending"
  | "checking_catalog"
  | "discovering"
  | "verifying"
  | "ranking"
  | "completed"
  | "failed";

/** Mirrors matching.ts's `MatchTier` verbatim — duplicated here for the same reason every other enum in this file is (see the extraction-method comment above), not a second competing taxonomy. */
export type RecommendationTier = "strong_fit" | "possible_fit" | "limited_fit";

// Recommendation Feedback Loop

/** See supabase/migrations/20260730000000_recommendation_feedback.sql for the durable "why" semantics of each value. */
export type RecommendationFeedbackType =
  | "dismissed"
  | "more_like_this"
  | "saved"
  | "help_me_apply"
  | "remind_later";

/** Only ever set on a `dismissed` row — see the migration's check constraint. */
export type RecommendationFeedbackReason =
  | "not_interested"
  | "too_expensive"
  | "too_far"
  | "wrong_timing"
  | "too_competitive"
  | "wrong_format"
  | "eligibility_mismatch"
  | "already_applied"
  | "other";

// Application Action Center

/** See supabase/migrations/20260731000000_application_plans.sql for the check constraint this mirrors. */
export type ApplicationPlanStatus =
  | "interested"
  | "planning"
  | "preparing"
  | "ready_to_apply"
  | "applied"
  | "accepted"
  | "rejected"
  | "withdrawn";

// Deadline & Reminder Center

/** See supabase/migrations/20260801000000_student_reminders.sql for the check constraints these mirror. */
export type ReminderType =
  | "opportunity_deadline"
  | "target_submit_date"
  | "application_task"
  | "custom"
  | "follow_up"
  | "recommendation_reminder";

export type ReminderSource =
  | "automatic"
  | "student_created"
  | "recommendation_feedback"
  | "application_plan"
  | "application_task";

// Student Portfolio & Evidence Vault

/** See supabase/migrations/20260802000000_student_portfolio.sql for the check constraint this mirrors. */
export type PortfolioItemType =
  | "activity"
  | "award"
  | "project"
  | "leadership"
  | "volunteer_service"
  | "work_experience"
  | "course"
  | "certification"
  | "skill"
  | "essay_response"
  | "recommendation_contact"
  | "document"
  | "link"
  | "custom";

/** "archived" is the student-facing "hide" action — never a delete. */
export type PortfolioItemVisibility = "visible" | "archived";

/** Mirrors src/lib/portfolio/constants.ts's ALLOWED_PORTFOLIO_MIME_TYPES verbatim — duplicated here for the same reason every other enum in this file is (types/database.ts stays a pure mirror of the schema, importing nothing from src/lib). */
export type PortfolioFileMimeType =
  | "application/pdf"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "image/png"
  | "image/jpeg";

export type EvidencePurpose =
  | "resume"
  | "essay"
  | "recommendation"
  | "transcript"
  | "award_proof"
  | "project_sample"
  | "eligibility_proof"
  | "other";

// Portfolio Verification & Trust Signals (Milestone 10.5)

/** See supabase/migrations/20260803000000_portfolio_verification.sql for the check constraint this mirrors. */
export type PortfolioVerificationLevel = "unverified" | "evidence_added" | "externally_confirmed" | "needs_review" | "rejected";

export type PortfolioVerificationMethod =
  | "uploaded_document"
  | "official_url"
  | "organization_email"
  | "teacher_or_mentor"
  | "recommendation_contact"
  | "manual_review"
  | "system_consistency_check";

export type PortfolioVerificationEventType =
  | "evidence_added"
  | "evidence_replaced"
  | "official_url_added"
  | "verification_requested"
  | "verification_resent"
  | "verification_cancelled"
  | "verification_confirmed"
  | "verification_declined"
  | "correction_requested"
  | "verification_expired"
  | "reviewer_decision"
  | "consistency_check_run"
  | "level_changed";

export type PortfolioVerificationActorType = "student" | "verifier" | "reviewer" | "system";

// Public-Source Verification Engine / OSINT (Milestone 10.6)

/** See supabase/migrations/20260804000000_portfolio_osint.sql for the check constraint this mirrors. */
export type PortfolioOsintCheckStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

/**
 * Never "true" or "false" — how strongly a claim is publicly supported so
 * far, nothing more. Mirrors src/lib/osint/scoring.ts's thresholds.
 */
export type PortfolioOsintSupportLevel =
  | "confirmed_by_authoritative_source"
  | "strongly_supported"
  | "partially_supported"
  | "unable_to_verify"
  | "needs_review";

export type PortfolioOsintSourceType =
  | "official_organization"
  | "github"
  | "crossref"
  | "icann_rdap"
  | "url_reputation"
  | "issuer_page"
  | "structured_metadata"
  | "other";

export type PortfolioOsintAuthorityLevel =
  | "issuer"
  | "official_organization"
  | "trusted_registry"
  | "verified_public_profile"
  | "secondary_source"
  | "unknown";

export type PortfolioOsintConflictSeverity = "info" | "minor" | "material";

export type PortfolioOsintReviewAction = "confirm_support" | "request_clarification" | "mark_insufficient" | "override_support_level";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          grade_level: number | null;
          city: string | null;
          state: string | null;
          country: string;
          weekly_availability: WeeklyAvailability | null;
          experience_level: ExperienceLevel | null;
          guided_mode: boolean;
          onboarding_version: number;
          onboarding_completed: boolean;
          onboarding_completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          grade_level?: number | null;
          city?: string | null;
          state?: string | null;
          country?: string;
          weekly_availability?: WeeklyAvailability | null;
          experience_level?: ExperienceLevel | null;
          guided_mode?: boolean;
          onboarding_version?: number;
          onboarding_completed?: boolean;
          onboarding_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string | null;
          grade_level?: number | null;
          city?: string | null;
          state?: string | null;
          country?: string;
          weekly_availability?: WeeklyAvailability | null;
          experience_level?: ExperienceLevel | null;
          guided_mode?: boolean;
          onboarding_version?: number;
          onboarding_completed?: boolean;
          onboarding_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      student_interests: {
        Row: {
          id: string;
          profile_id: string;
          interest: InterestValue;
          other_text: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          interest: InterestValue;
          other_text?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          interest?: InterestValue;
          other_text?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      student_goals: {
        Row: {
          id: string;
          profile_id: string;
          goal: GoalValue;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          goal: GoalValue;
          created_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          goal?: GoalValue;
          created_at?: string;
        };
        Relationships: [];
      };
      student_opportunity_preferences: {
        Row: {
          id: string;
          profile_id: string;
          preference_key: OpportunityPreferenceKey;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          preference_key: OpportunityPreferenceKey;
          created_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          preference_key?: OpportunityPreferenceKey;
          created_at?: string;
        };
        Relationships: [];
      };
      opportunities: {
        Row: {
          id: string;
          title: string;
          organization: string;
          description: string;
          opportunity_type: OpportunityType;
          format: OpportunityFormat;
          location_text: string | null;
          remote_allowed: boolean;
          min_grade: number | null;
          max_grade: number | null;
          cost_type: OpportunityCostType;
          cost_amount: number | null;
          interest_tags: InterestValue[];
          application_deadline: string | null;
          start_date: string | null;
          end_date: string | null;
          weekly_commitment_hours: number | null;
          duration_text: string | null;
          application_url: string;
          source_url: string | null;
          image_url: string | null;
          is_active: boolean;
          is_verified: boolean;
          is_sample: boolean;
          canonical_url: string | null;
          source_id: string | null;
          last_verified_at: string | null;
          next_verification_at: string | null;
          verification_status: OpportunityVerificationStatus;
          verification_confidence: number;
          deadline_status: OpportunityDeadlineStatus;
          eligibility_status: OpportunityEligibilityDataStatus;
          application_status: OpportunityApplicationStatus;
          source_last_modified_at: string | null;
          first_seen_at: string;
          last_seen_at: string;
          rejection_reason: string | null;
          residency_requirements: string | null;
          citizenship_requirements: string | null;
          eligibility_notes: string | null;
          application_cycle: string | null;
          recurrence_pattern: string | null;
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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          organization: string;
          description: string;
          opportunity_type: OpportunityType;
          format: OpportunityFormat;
          location_text?: string | null;
          remote_allowed?: boolean;
          min_grade?: number | null;
          max_grade?: number | null;
          cost_type: OpportunityCostType;
          cost_amount?: number | null;
          interest_tags?: InterestValue[];
          application_deadline?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          weekly_commitment_hours?: number | null;
          duration_text?: string | null;
          application_url: string;
          source_url?: string | null;
          image_url?: string | null;
          is_active?: boolean;
          is_verified?: boolean;
          is_sample?: boolean;
          canonical_url?: string | null;
          source_id?: string | null;
          last_verified_at?: string | null;
          next_verification_at?: string | null;
          verification_status?: OpportunityVerificationStatus;
          verification_confidence?: number;
          deadline_status?: OpportunityDeadlineStatus;
          eligibility_status?: OpportunityEligibilityDataStatus;
          application_status?: OpportunityApplicationStatus;
          source_last_modified_at?: string | null;
          first_seen_at?: string;
          last_seen_at?: string;
          rejection_reason?: string | null;
          residency_requirements?: string | null;
          citizenship_requirements?: string | null;
          eligibility_notes?: string | null;
          application_cycle?: string | null;
          recurrence_pattern?: string | null;
          verification_label?: OpportunityVerificationLabel;
          has_unresolved_conflict?: boolean;
          application_opens_at?: string | null;
          application_closes_at?: string | null;
          status_evidence?: string | null;
          status_checked_at?: string | null;
          age_min?: number | null;
          age_max?: number | null;
          school_enrollment_required?: boolean | null;
          stipend_amount?: number | null;
          hourly_pay?: number | null;
          financial_aid_available?: boolean | null;
          transportation_support?: boolean | null;
          housing_support?: boolean | null;
          essay_required?: boolean | null;
          recommendation_required?: boolean | null;
          transcript_required?: boolean | null;
          interview_required?: boolean | null;
          parent_consent_required?: boolean | null;
          schedule_text?: string | null;
          attendance_requirements?: string | null;
          application_contact?: string | null;
          notification_date?: string | null;
          extended_details?: OpportunityExtendedDetails;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          organization?: string;
          description?: string;
          opportunity_type?: OpportunityType;
          format?: OpportunityFormat;
          location_text?: string | null;
          remote_allowed?: boolean;
          min_grade?: number | null;
          max_grade?: number | null;
          cost_type?: OpportunityCostType;
          cost_amount?: number | null;
          interest_tags?: InterestValue[];
          application_deadline?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          weekly_commitment_hours?: number | null;
          duration_text?: string | null;
          application_url?: string;
          source_url?: string | null;
          image_url?: string | null;
          is_active?: boolean;
          is_verified?: boolean;
          is_sample?: boolean;
          canonical_url?: string | null;
          source_id?: string | null;
          last_verified_at?: string | null;
          next_verification_at?: string | null;
          verification_status?: OpportunityVerificationStatus;
          verification_confidence?: number;
          deadline_status?: OpportunityDeadlineStatus;
          eligibility_status?: OpportunityEligibilityDataStatus;
          application_status?: OpportunityApplicationStatus;
          source_last_modified_at?: string | null;
          first_seen_at?: string;
          last_seen_at?: string;
          rejection_reason?: string | null;
          residency_requirements?: string | null;
          citizenship_requirements?: string | null;
          eligibility_notes?: string | null;
          application_cycle?: string | null;
          recurrence_pattern?: string | null;
          verification_label?: OpportunityVerificationLabel;
          has_unresolved_conflict?: boolean;
          application_opens_at?: string | null;
          application_closes_at?: string | null;
          status_evidence?: string | null;
          status_checked_at?: string | null;
          age_min?: number | null;
          age_max?: number | null;
          school_enrollment_required?: boolean | null;
          stipend_amount?: number | null;
          hourly_pay?: number | null;
          financial_aid_available?: boolean | null;
          transportation_support?: boolean | null;
          housing_support?: boolean | null;
          essay_required?: boolean | null;
          recommendation_required?: boolean | null;
          transcript_required?: boolean | null;
          interview_required?: boolean | null;
          parent_consent_required?: boolean | null;
          schedule_text?: string | null;
          attendance_requirements?: string | null;
          application_contact?: string | null;
          notification_date?: string | null;
          extended_details?: OpportunityExtendedDetails;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      opportunity_sources: {
        Row: {
          id: string;
          name: string;
          base_url: string;
          source_type: OpportunitySourceType;
          trust_level: OpportunitySourceTrustLevel;
          crawl_method: OpportunitySourceCrawlMethod;
          is_active: boolean;
          requires_javascript: boolean;
          last_checked_at: string | null;
          last_success_at: string | null;
          failure_count: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          base_url: string;
          source_type: OpportunitySourceType;
          trust_level?: OpportunitySourceTrustLevel;
          crawl_method: OpportunitySourceCrawlMethod;
          is_active?: boolean;
          requires_javascript?: boolean;
          last_checked_at?: string | null;
          last_success_at?: string | null;
          failure_count?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          base_url?: string;
          source_type?: OpportunitySourceType;
          trust_level?: OpportunitySourceTrustLevel;
          crawl_method?: OpportunitySourceCrawlMethod;
          is_active?: boolean;
          requires_javascript?: boolean;
          last_checked_at?: string | null;
          last_success_at?: string | null;
          failure_count?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      opportunity_ingestion_runs: {
        Row: {
          id: string;
          source_id: string;
          status: OpportunityIngestionRunStatus;
          started_at: string;
          completed_at: string | null;
          items_found: number;
          items_created: number;
          items_updated: number;
          items_rejected: number;
          error_summary: string | null;
        };
        Insert: {
          id?: string;
          source_id: string;
          status?: OpportunityIngestionRunStatus;
          started_at?: string;
          completed_at?: string | null;
          items_found?: number;
          items_created?: number;
          items_updated?: number;
          items_rejected?: number;
          error_summary?: string | null;
        };
        Update: {
          id?: string;
          source_id?: string;
          status?: OpportunityIngestionRunStatus;
          started_at?: string;
          completed_at?: string | null;
          items_found?: number;
          items_created?: number;
          items_updated?: number;
          items_rejected?: number;
          error_summary?: string | null;
        };
        Relationships: [];
      };
      raw_opportunity_records: {
        Row: {
          id: string;
          source_id: string;
          ingestion_run_id: string;
          source_url: string;
          raw_title: string | null;
          raw_content: string;
          raw_metadata: Record<string, unknown>;
          content_hash: string;
          fetched_at: string;
          processing_status: RawOpportunityProcessingStatus;
          processing_error: string | null;
        };
        Insert: {
          id?: string;
          source_id: string;
          ingestion_run_id: string;
          source_url: string;
          raw_title?: string | null;
          raw_content: string;
          raw_metadata?: Record<string, unknown>;
          content_hash: string;
          fetched_at?: string;
          processing_status?: RawOpportunityProcessingStatus;
          processing_error?: string | null;
        };
        Update: {
          id?: string;
          source_id?: string;
          ingestion_run_id?: string;
          source_url?: string;
          raw_title?: string | null;
          raw_content?: string;
          raw_metadata?: Record<string, unknown>;
          content_hash?: string;
          fetched_at?: string;
          processing_status?: RawOpportunityProcessingStatus;
          processing_error?: string | null;
        };
        Relationships: [];
      };
      opportunity_source_links: {
        Row: {
          opportunity_id: string;
          source_id: string;
          source_url: string;
          first_seen_at: string;
          last_seen_at: string;
          is_primary: boolean;
        };
        Insert: {
          opportunity_id: string;
          source_id: string;
          source_url: string;
          first_seen_at?: string;
          last_seen_at?: string;
          is_primary?: boolean;
        };
        Update: {
          opportunity_id?: string;
          source_id?: string;
          source_url?: string;
          first_seen_at?: string;
          last_seen_at?: string;
          is_primary?: boolean;
        };
        Relationships: [];
      };
      opportunity_review_queue: {
        Row: {
          id: string;
          opportunity_id: string | null;
          raw_record_id: string | null;
          reason: OpportunityReviewQueueReason;
          details: string | null;
          status: OpportunityReviewQueueStatus;
          created_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          opportunity_id?: string | null;
          raw_record_id?: string | null;
          reason: OpportunityReviewQueueReason;
          details?: string | null;
          status?: OpportunityReviewQueueStatus;
          created_at?: string;
          resolved_at?: string | null;
        };
        Update: {
          id?: string;
          opportunity_id?: string | null;
          raw_record_id?: string | null;
          reason?: OpportunityReviewQueueReason;
          details?: string | null;
          status?: OpportunityReviewQueueStatus;
          created_at?: string;
          resolved_at?: string | null;
        };
        Relationships: [];
      };
      opportunity_field_evidence: {
        Row: {
          id: string;
          opportunity_id: string;
          field_name: string;
          extracted_value: unknown;
          evidence_text: string | null;
          source_url: string | null;
          extraction_method: OpportunityFieldEvidenceExtractionMethod;
          confidence: number;
          verified_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          opportunity_id: string;
          field_name: string;
          extracted_value?: unknown;
          evidence_text?: string | null;
          source_url?: string | null;
          extraction_method: OpportunityFieldEvidenceExtractionMethod;
          confidence?: number;
          verified_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          opportunity_id?: string;
          field_name?: string;
          extracted_value?: unknown;
          evidence_text?: string | null;
          source_url?: string | null;
          extraction_method?: OpportunityFieldEvidenceExtractionMethod;
          confidence?: number;
          verified_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      saved_opportunities: {
        Row: {
          user_id: string;
          opportunity_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          opportunity_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          opportunity_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      student_discovery_runs: {
        Row: {
          id: string;
          user_id: string;
          status: StudentDiscoveryRunStatus;
          batch_number: number;
          profile_snapshot: Record<string, unknown>;
          sources_selected: string[];
          started_at: string;
          completed_at: string | null;
          results_found: number;
          error_summary: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          status?: StudentDiscoveryRunStatus;
          batch_number: number;
          profile_snapshot?: Record<string, unknown>;
          sources_selected?: string[];
          started_at?: string;
          completed_at?: string | null;
          results_found?: number;
          error_summary?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          status?: StudentDiscoveryRunStatus;
          batch_number?: number;
          profile_snapshot?: Record<string, unknown>;
          sources_selected?: string[];
          started_at?: string;
          completed_at?: string | null;
          results_found?: number;
          error_summary?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      student_opportunity_recommendations: {
        Row: {
          id: string;
          user_id: string;
          opportunity_id: string;
          discovery_run_id: string | null;
          batch_number: number;
          personalized_rank: number;
          recommendation_tier: RecommendationTier;
          fit_reasons: string[];
          concerns: string[];
          shown_at: string;
          dismissed_at: string | null;
          saved_at: string | null;
          last_verified_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          opportunity_id: string;
          discovery_run_id?: string | null;
          batch_number: number;
          personalized_rank: number;
          recommendation_tier: RecommendationTier;
          fit_reasons?: string[];
          concerns?: string[];
          shown_at?: string;
          dismissed_at?: string | null;
          saved_at?: string | null;
          last_verified_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          opportunity_id?: string;
          discovery_run_id?: string | null;
          batch_number?: number;
          personalized_rank?: number;
          recommendation_tier?: RecommendationTier;
          fit_reasons?: string[];
          concerns?: string[];
          shown_at?: string;
          dismissed_at?: string | null;
          saved_at?: string | null;
          last_verified_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      recommendation_feedback: {
        Row: {
          id: string;
          user_id: string;
          opportunity_id: string;
          recommendation_id: string | null;
          feedback_type: RecommendationFeedbackType;
          reason: RecommendationFeedbackReason | null;
          note: string | null;
          reminder_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          opportunity_id: string;
          recommendation_id?: string | null;
          feedback_type: RecommendationFeedbackType;
          reason?: RecommendationFeedbackReason | null;
          note?: string | null;
          reminder_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          opportunity_id?: string;
          recommendation_id?: string | null;
          feedback_type?: RecommendationFeedbackType;
          reason?: RecommendationFeedbackReason | null;
          note?: string | null;
          reminder_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      application_plans: {
        Row: {
          id: string;
          user_id: string;
          opportunity_id: string;
          status: ApplicationPlanStatus;
          target_submit_date: string | null;
          official_deadline: string | null;
          notes: string | null;
          started_at: string;
          submitted_at: string | null;
          decision_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          opportunity_id: string;
          status?: ApplicationPlanStatus;
          target_submit_date?: string | null;
          official_deadline?: string | null;
          notes?: string | null;
          started_at?: string;
          submitted_at?: string | null;
          decision_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          opportunity_id?: string;
          status?: ApplicationPlanStatus;
          target_submit_date?: string | null;
          official_deadline?: string | null;
          notes?: string | null;
          started_at?: string;
          submitted_at?: string | null;
          decision_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      application_tasks: {
        Row: {
          id: string;
          user_id: string;
          application_plan_id: string;
          title: string;
          description: string | null;
          due_date: string | null;
          completed_at: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          application_plan_id: string;
          title: string;
          description?: string | null;
          due_date?: string | null;
          completed_at?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          application_plan_id?: string;
          title?: string;
          description?: string | null;
          due_date?: string | null;
          completed_at?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      student_reminders: {
        Row: {
          id: string;
          user_id: string;
          opportunity_id: string | null;
          application_plan_id: string | null;
          application_task_id: string | null;
          reminder_type: ReminderType;
          title: string;
          message: string | null;
          remind_at: string;
          completed_at: string | null;
          dismissed_at: string | null;
          snoozed_until: string | null;
          source: ReminderSource;
          dedupe_key: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          opportunity_id?: string | null;
          application_plan_id?: string | null;
          application_task_id?: string | null;
          reminder_type: ReminderType;
          title: string;
          message?: string | null;
          remind_at: string;
          completed_at?: string | null;
          dismissed_at?: string | null;
          snoozed_until?: string | null;
          source: ReminderSource;
          dedupe_key?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          opportunity_id?: string | null;
          application_plan_id?: string | null;
          application_task_id?: string | null;
          reminder_type?: ReminderType;
          title?: string;
          message?: string | null;
          remind_at?: string;
          completed_at?: string | null;
          dismissed_at?: string | null;
          snoozed_until?: string | null;
          source?: ReminderSource;
          dedupe_key?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      portfolio_items: {
        Row: {
          id: string;
          user_id: string;
          item_type: PortfolioItemType;
          title: string;
          organization: string | null;
          description: string | null;
          start_date: string | null;
          end_date: string | null;
          is_current: boolean;
          hours_per_week: number | null;
          weeks_per_year: number | null;
          role: string | null;
          outcome: string | null;
          skills: string[];
          tags: string[];
          url: string | null;
          github_username: string | null;
          visibility: PortfolioItemVisibility;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          item_type: PortfolioItemType;
          title: string;
          organization?: string | null;
          description?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          is_current?: boolean;
          hours_per_week?: number | null;
          weeks_per_year?: number | null;
          role?: string | null;
          outcome?: string | null;
          skills?: string[];
          tags?: string[];
          url?: string | null;
          github_username?: string | null;
          visibility?: PortfolioItemVisibility;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          item_type?: PortfolioItemType;
          title?: string;
          organization?: string | null;
          description?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          is_current?: boolean;
          hours_per_week?: number | null;
          weeks_per_year?: number | null;
          role?: string | null;
          outcome?: string | null;
          skills?: string[];
          tags?: string[];
          url?: string | null;
          github_username?: string | null;
          visibility?: PortfolioItemVisibility;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      portfolio_files: {
        Row: {
          id: string;
          user_id: string;
          portfolio_item_id: string | null;
          storage_path: string;
          original_filename: string;
          mime_type: PortfolioFileMimeType;
          file_size: number;
          label: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          portfolio_item_id?: string | null;
          storage_path: string;
          original_filename: string;
          mime_type: PortfolioFileMimeType;
          file_size: number;
          label?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          portfolio_item_id?: string | null;
          storage_path?: string;
          original_filename?: string;
          mime_type?: PortfolioFileMimeType;
          file_size?: number;
          label?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      application_evidence_links: {
        Row: {
          id: string;
          user_id: string;
          application_plan_id: string;
          portfolio_item_id: string;
          evidence_purpose: EvidencePurpose;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          application_plan_id: string;
          portfolio_item_id: string;
          evidence_purpose: EvidencePurpose;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          application_plan_id?: string;
          portfolio_item_id?: string;
          evidence_purpose?: EvidencePurpose;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      portfolio_verifications: {
        Row: {
          id: string;
          user_id: string;
          portfolio_item_id: string;
          verification_level: PortfolioVerificationLevel;
          verification_method: PortfolioVerificationMethod | null;
          evidence_file_id: string | null;
          evidence_url: string | null;
          verifier_name: string | null;
          verifier_email: string | null;
          verifier_organization: string | null;
          verification_code_hash: string | null;
          requested_at: string | null;
          verified_at: string | null;
          expires_at: string | null;
          review_notes: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          portfolio_item_id: string;
          verification_level?: PortfolioVerificationLevel;
          verification_method?: PortfolioVerificationMethod | null;
          evidence_file_id?: string | null;
          evidence_url?: string | null;
          verifier_name?: string | null;
          verifier_email?: string | null;
          verifier_organization?: string | null;
          verification_code_hash?: string | null;
          requested_at?: string | null;
          verified_at?: string | null;
          expires_at?: string | null;
          review_notes?: string | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          portfolio_item_id?: string;
          verification_level?: PortfolioVerificationLevel;
          verification_method?: PortfolioVerificationMethod | null;
          evidence_file_id?: string | null;
          evidence_url?: string | null;
          verifier_name?: string | null;
          verifier_email?: string | null;
          verifier_organization?: string | null;
          verification_code_hash?: string | null;
          requested_at?: string | null;
          verified_at?: string | null;
          expires_at?: string | null;
          review_notes?: string | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      portfolio_verification_events: {
        Row: {
          id: string;
          user_id: string;
          portfolio_item_id: string;
          verification_id: string;
          event_type: PortfolioVerificationEventType;
          actor_type: PortfolioVerificationActorType;
          previous_level: PortfolioVerificationLevel | null;
          new_level: PortfolioVerificationLevel | null;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          portfolio_item_id: string;
          verification_id: string;
          event_type: PortfolioVerificationEventType;
          actor_type: PortfolioVerificationActorType;
          previous_level?: PortfolioVerificationLevel | null;
          new_level?: PortfolioVerificationLevel | null;
          reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          portfolio_item_id?: string;
          verification_id?: string;
          event_type?: PortfolioVerificationEventType;
          actor_type?: PortfolioVerificationActorType;
          previous_level?: PortfolioVerificationLevel | null;
          new_level?: PortfolioVerificationLevel | null;
          reason?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      portfolio_osint_checks: {
        Row: {
          id: string;
          user_id: string;
          portfolio_item_id: string;
          status: PortfolioOsintCheckStatus;
          consent_scope: Record<string, unknown>;
          started_at: string | null;
          completed_at: string | null;
          expires_at: string | null;
          final_support_level: PortfolioOsintSupportLevel | null;
          score: number | null;
          score_breakdown: { label: string; points: number }[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          portfolio_item_id: string;
          status?: PortfolioOsintCheckStatus;
          consent_scope?: Record<string, unknown>;
          started_at?: string | null;
          completed_at?: string | null;
          expires_at?: string | null;
          final_support_level?: PortfolioOsintSupportLevel | null;
          score?: number | null;
          score_breakdown?: { label: string; points: number }[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          portfolio_item_id?: string;
          status?: PortfolioOsintCheckStatus;
          consent_scope?: Record<string, unknown>;
          started_at?: string | null;
          completed_at?: string | null;
          expires_at?: string | null;
          final_support_level?: PortfolioOsintSupportLevel | null;
          score?: number | null;
          score_breakdown?: { label: string; points: number }[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      portfolio_osint_evidence: {
        Row: {
          id: string;
          user_id: string;
          check_id: string;
          source_type: PortfolioOsintSourceType;
          source_url: string;
          source_domain: string;
          authority_level: PortfolioOsintAuthorityLevel;
          extracted_fields: Record<string, unknown>;
          confidence: number;
          content_hash: string;
          retrieved_at: string;
          expires_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          check_id: string;
          source_type: PortfolioOsintSourceType;
          source_url: string;
          source_domain: string;
          authority_level: PortfolioOsintAuthorityLevel;
          extracted_fields?: Record<string, unknown>;
          confidence?: number;
          content_hash: string;
          retrieved_at?: string;
          expires_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          check_id?: string;
          source_type?: PortfolioOsintSourceType;
          source_url?: string;
          source_domain?: string;
          authority_level?: PortfolioOsintAuthorityLevel;
          extracted_fields?: Record<string, unknown>;
          confidence?: number;
          content_hash?: string;
          retrieved_at?: string;
          expires_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      portfolio_osint_conflicts: {
        Row: {
          id: string;
          user_id: string;
          check_id: string;
          field_name: string;
          claimed_value: string | null;
          observed_value: string | null;
          severity: PortfolioOsintConflictSeverity;
          respectful_message: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          check_id: string;
          field_name: string;
          claimed_value?: string | null;
          observed_value?: string | null;
          severity: PortfolioOsintConflictSeverity;
          respectful_message: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          check_id?: string;
          field_name?: string;
          claimed_value?: string | null;
          observed_value?: string | null;
          severity?: PortfolioOsintConflictSeverity;
          respectful_message?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      portfolio_osint_review_events: {
        Row: {
          id: string;
          user_id: string;
          check_id: string;
          reviewer_email: string;
          action: PortfolioOsintReviewAction;
          previous_support_level: string | null;
          new_support_level: string | null;
          reason: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          check_id: string;
          reviewer_email: string;
          action: PortfolioOsintReviewAction;
          previous_support_level?: string | null;
          new_support_level?: string | null;
          reason: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          check_id?: string;
          reviewer_email?: string;
          action?: PortfolioOsintReviewAction;
          previous_support_level?: string | null;
          new_support_level?: string | null;
          reason?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      complete_onboarding: {
        Args: {
          p_display_name: string;
          p_grade_level: number;
          p_city: string | null;
          p_state: string | null;
          p_country: string;
          p_interests: InterestValue[];
          p_other_interest_text: string | null;
          p_goals: GoalValue[];
          p_preferences: OpportunityPreferenceKey[];
          p_weekly_availability: WeeklyAvailability;
          p_experience_level: ExperienceLevel;
          p_guided_mode: boolean;
          p_onboarding_version: number;
        };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
  };
};

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
  | "html_scrape";

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
  | "residency_citizenship_ambiguity";

export type OpportunityReviewQueueStatus = "open" | "resolved" | "dismissed";

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

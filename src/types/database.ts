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

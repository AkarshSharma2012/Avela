// Hand-written to match supabase/migrations/20260725000000_create_profiles.sql.
// Once the Supabase CLI is linked to a project, regenerate with:
//   npx supabase gen types typescript --local > src/types/database.ts

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
          onboarding_completed: boolean;
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
          onboarding_completed?: boolean;
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
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};

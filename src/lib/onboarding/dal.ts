import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { GoalValue, InterestValue, OpportunityPreferenceKey } from "@/types/database";

export type OnboardingSummary = {
  interests: InterestValue[];
  otherInterestText: string | null;
  goals: GoalValue[];
  preferences: OpportunityPreferenceKey[];
};

const EMPTY_SUMMARY: OnboardingSummary = {
  interests: [],
  otherInterestText: null,
  goals: [],
  preferences: [],
};

/** Interests, goals, and opportunity preferences a student selected during onboarding. */
export const getOnboardingSummary = cache(
  async (profileId: string): Promise<OnboardingSummary> => {
    const supabase = await createClient();

    const [interestsResult, goalsResult, preferencesResult] = await Promise.all([
      supabase
        .from("student_interests")
        .select("interest, other_text")
        .eq("profile_id", profileId),
      supabase.from("student_goals").select("goal").eq("profile_id", profileId),
      supabase
        .from("student_opportunity_preferences")
        .select("preference_key")
        .eq("profile_id", profileId),
    ]);

    if (interestsResult.error) {
      console.error(
        "[onboarding] failed to load interests:",
        interestsResult.error.message
      );
    }
    if (goalsResult.error) {
      console.error("[onboarding] failed to load goals:", goalsResult.error.message);
    }
    if (preferencesResult.error) {
      console.error(
        "[onboarding] failed to load preferences:",
        preferencesResult.error.message
      );
    }

    if (!interestsResult.data && !goalsResult.data && !preferencesResult.data) {
      return EMPTY_SUMMARY;
    }

    const otherRow = interestsResult.data?.find((row) => row.interest === "Other");

    return {
      interests: interestsResult.data?.map((row) => row.interest) ?? [],
      otherInterestText: otherRow?.other_text ?? null,
      goals: goalsResult.data?.map((row) => row.goal) ?? [],
      preferences: preferencesResult.data?.map((row) => row.preference_key) ?? [],
    };
  }
);

import { onboardingSchema, type OnboardingData } from "@/lib/onboarding/schema";
import { ONBOARDING_VERSION } from "@/lib/onboarding/constants";
import type { Database } from "@/types/database";

export type CompleteOnboardingResult =
  | { success: true }
  | { success: false; error: string };

export type CompleteOnboardingArgs =
  Database["public"]["Functions"]["complete_onboarding"]["Args"];

export type SaveOnboarding = (
  args: CompleteOnboardingArgs
) => Promise<{ error: { message: string } | null }>;

/** Maps validated wizard data onto the `complete_onboarding` RPC's argument shape. */
export function buildRpcArgs(data: OnboardingData): CompleteOnboardingArgs {
  return {
    p_display_name: data.preferredName,
    p_grade_level: data.gradeLevel,
    p_city: data.city.trim().length > 0 ? data.city.trim() : null,
    p_state: data.state.trim().length > 0 ? data.state.trim() : null,
    p_country: data.country,
    p_interests: data.interests,
    p_other_interest_text: data.interests.includes("Other")
      ? data.otherInterestText.trim()
      : null,
    p_goals: data.goals,
    p_preferences: data.preferences,
    p_weekly_availability: data.weeklyAvailability,
    p_experience_level: data.experienceLevel,
    p_guided_mode: data.guidedMode,
    p_onboarding_version: ONBOARDING_VERSION,
  };
}

/**
 * Validates the full onboarding payload and, only if valid, calls `save`
 * (the `complete_onboarding` RPC in production). `save` is injected so this
 * can be unit-tested without a real Supabase client, and so it's provable
 * that a failed validation never reaches the database — onboarding is only
 * ever marked complete after a successful save.
 */
export async function completeOnboarding(
  input: unknown,
  save: SaveOnboarding
): Promise<CompleteOnboardingResult> {
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error:
        "Some information is missing or invalid. Please review each step and try again.",
    };
  }

  const { error } = await save(buildRpcArgs(parsed.data));
  if (error) {
    console.error("[onboarding] complete_onboarding failed:", error.message);
    return {
      success: false,
      error: "We couldn't save your onboarding information. Please try again.",
    };
  }

  return { success: true };
}

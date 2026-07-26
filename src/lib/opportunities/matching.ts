import { isGradeEligible } from "@/lib/opportunities/eligibility";
import { formatGradeRange } from "@/lib/opportunities/format";
import type { OnboardingSummary } from "@/lib/onboarding/dal";
import type {
  ExperienceLevel,
  GoalValue,
  InterestValue,
  OpportunityPreferenceKey,
  WeeklyAvailability,
} from "@/types/database";
import type { Opportunity } from "@/types/opportunity";
import type { Profile } from "@/types/profile";

export type MatchTier = "strong_fit" | "possible_fit" | "limited_fit";

export type MatchResult = {
  tier: MatchTier;
  /** Short, transparent explanations — never a percentage or score. Always at least one. */
  reasons: string[];
};

/**
 * The subset of onboarding data the matching engine reads, decoupled from
 * `Profile`/`OnboardingSummary` so this module (and its tests) never need a
 * Supabase client or a real profile row.
 */
export type MatchProfileInput = {
  gradeLevel: number | null;
  city: string | null;
  state: string | null;
  weeklyAvailability: WeeklyAvailability | null;
  experienceLevel: ExperienceLevel | null;
  interests: InterestValue[];
  goals: GoalValue[];
  preferences: OpportunityPreferenceKey[];
};

const GOAL_TO_OPPORTUNITY_TYPE: Partial<Record<GoalValue, Opportunity["opportunity_type"]>> = {
  "Find an internship": "internship",
  "Find a summer program": "summer_program",
  "Enter competitions": "competition",
  "Explore research": "research",
  "Find volunteer work": "volunteer",
};

// Upper bound of each availability bracket, in hours/week. `null` means the
// student's availability is unknown or flexible, so it can't be compared.
// Exported so eligibility-engine.ts can apply the same comparison without
// duplicating the table.
export const WEEKLY_AVAILABILITY_MAX_HOURS: Record<WeeklyAvailability, number | null> = {
  less_than_2: 2,
  "2_to_5": 5,
  "5_to_10": 10,
  more_than_10: Infinity,
  varies: null,
  not_sure: null,
};

function lowercaseFirst(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toLowerCase() + text.slice(1);
}

/** Combines a `profiles` row with its onboarding join-table summary into the shape `matchOpportunity` reads. */
export function buildMatchProfileInput(
  profile: Profile,
  summary: OnboardingSummary
): MatchProfileInput {
  return {
    gradeLevel: profile.grade_level,
    city: profile.city,
    state: profile.state,
    weeklyAvailability: profile.weekly_availability,
    experienceLevel: profile.experience_level,
    interests: summary.interests,
    goals: summary.goals,
    preferences: summary.preferences,
  };
}

/**
 * Deterministic, explainable profile-based matching. No percentages and no
 * claim of AI/ML — every signal below is a plain comparison between a
 * student's onboarding answers and an opportunity's fields, and every
 * signal that fires produces a human-readable reason.
 *
 * Grade eligibility is a hard gate: an ineligible opportunity is always
 * "limited_fit" regardless of how well anything else lines up, since a
 * student who doesn't meet the grade range can't actually apply.
 *
 * Experience level is deliberately not scored: `opportunities` has no
 * per-listing difficulty field, and inventing one from unrelated columns
 * (e.g. commitment hours) would be a fabricated signal, not a real one —
 * see docs/decision-log.md.
 */
export function matchOpportunity(
  opportunity: Opportunity,
  profile: MatchProfileInput
): MatchResult {
  const gradeEligible = isGradeEligible(
    profile.gradeLevel,
    opportunity.min_grade,
    opportunity.max_grade
  );

  if (!gradeEligible) {
    return {
      tier: "limited_fit",
      reasons: [
        `Outside your grade level (opens for ${formatGradeRange(opportunity.min_grade, opportunity.max_grade)})`,
      ],
    };
  }

  const positives: string[] = [];
  const negatives: string[] = [];

  if (profile.gradeLevel !== null && (opportunity.min_grade !== null || opportunity.max_grade !== null)) {
    positives.push("Open to your grade level");
  }

  const matchedInterest = opportunity.interest_tags.find((tag) =>
    profile.interests.includes(tag)
  );
  if (matchedInterest) {
    positives.push(`Matches your interest in ${matchedInterest}`);
  }

  const matchedGoal = profile.goals.find(
    (goal) => GOAL_TO_OPPORTUNITY_TYPE[goal] === opportunity.opportunity_type
  );
  if (matchedGoal) {
    positives.push(`Aligns with your goal to ${lowercaseFirst(matchedGoal)}`);
  }

  const wantsVirtual = profile.preferences.includes("virtual");
  const wantsInPerson = profile.preferences.includes("in_person");
  if (wantsVirtual && (opportunity.format === "virtual" || opportunity.format === "hybrid")) {
    positives.push("Fits your preferred virtual format");
  } else if (wantsInPerson && (opportunity.format === "in_person" || opportunity.format === "hybrid")) {
    positives.push("Fits your preferred in-person format");
  }

  const wantsFreeOnly = profile.preferences.includes("free_only");
  if (wantsFreeOnly) {
    if (opportunity.cost_type === "free") {
      positives.push("Free, matching your cost preference");
    } else {
      negatives.push("Costs money, which may not fit your preference for free opportunities");
    }
  }

  if (profile.preferences.includes("national") && opportunity.remote_allowed) {
    positives.push("Open to students outside your area");
  } else if (profile.preferences.includes("local")) {
    const home = [profile.city, profile.state].filter(Boolean).map((s) => s!.toLowerCase());
    const location = opportunity.location_text?.toLowerCase() ?? "";
    if (home.length > 0 && home.some((place) => location.includes(place))) {
      positives.push("Near your location");
    }
  }

  const availabilityMaxHours =
    profile.weeklyAvailability !== null
      ? WEEKLY_AVAILABILITY_MAX_HOURS[profile.weeklyAvailability]
      : null;
  if (availabilityMaxHours !== null && opportunity.weekly_commitment_hours !== null) {
    if (opportunity.weekly_commitment_hours <= availabilityMaxHours) {
      positives.push("Fits your weekly availability");
    } else {
      negatives.push("May take more time than your weekly availability");
    }
  }

  const netScore = positives.length - negatives.length;
  const tier: MatchTier = netScore >= 3 ? "strong_fit" : netScore >= 1 ? "possible_fit" : "limited_fit";

  if (positives.length === 0 && negatives.length === 0) {
    return {
      tier: "possible_fit",
      reasons: ["Add more to your profile for a personalized match"],
    };
  }

  const reasons =
    tier === "limited_fit" && negatives.length > 0
      ? [...negatives, ...positives].slice(0, 3)
      : positives.slice(0, 3);

  return { tier, reasons: reasons.length > 0 ? reasons : negatives.slice(0, 3) };
}

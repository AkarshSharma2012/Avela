import type {
  ExperienceLevel,
  GoalValue,
  InterestValue,
  OpportunityPreferenceKey,
  WeeklyAvailability,
} from "@/types/database";
import { UNITED_STATES } from "@/lib/onboarding/constants";

/**
 * Everything the wizard collects, across all 6 steps, plus which step the
 * student was on. Kept as one flat object so it can be serialized as-is to
 * `localStorage` for refresh-safe persistence (see `storage.ts`).
 */
export type OnboardingDraft = {
  step: number;
  preferredName: string;
  gradeLevel: number | null;
  city: string;
  state: string;
  country: string;
  interests: InterestValue[];
  otherInterestText: string;
  goals: GoalValue[];
  preferences: OpportunityPreferenceKey[];
  weeklyAvailability: WeeklyAvailability | null;
  experienceLevel: ExperienceLevel | null;
  guidedMode: boolean;
};

/** The subset of the draft the final submission needs — everything but `step`. */
export function toOnboardingPayload(draft: OnboardingDraft) {
  return {
    preferredName: draft.preferredName,
    gradeLevel: draft.gradeLevel,
    city: draft.city,
    state: draft.state,
    country: draft.country,
    interests: draft.interests,
    otherInterestText: draft.otherInterestText,
    goals: draft.goals,
    preferences: draft.preferences,
    weeklyAvailability: draft.weeklyAvailability,
    experienceLevel: draft.experienceLevel,
    guidedMode: draft.guidedMode,
  };
}

/**
 * Encodes the draft as `{ name, value }` pairs suitable for `<input
 * type="hidden">` elements inside a real `<form action={formAction}>`.
 * Array fields (interests/goals/preferences) become multiple entries with
 * the same `name`, exactly like a native multi-checkbox group — the server
 * reads them back with `formData.getAll(name)`. Using a real form action is
 * what lets the wizard call the Server Action returned by `useActionState`
 * without a manual `onClick` dispatch (which React requires to run inside a
 * transition — a real form submission already is one).
 */
export function draftToFormEntries(
  draft: OnboardingDraft
): { name: string; value: string }[] {
  const entries: { name: string; value: string }[] = [
    { name: "preferredName", value: draft.preferredName },
    { name: "gradeLevel", value: draft.gradeLevel !== null ? String(draft.gradeLevel) : "" },
    { name: "city", value: draft.city },
    { name: "state", value: draft.state },
    { name: "country", value: draft.country },
    { name: "otherInterestText", value: draft.otherInterestText },
    { name: "weeklyAvailability", value: draft.weeklyAvailability ?? "" },
    { name: "experienceLevel", value: draft.experienceLevel ?? "" },
    { name: "guidedMode", value: draft.guidedMode ? "true" : "false" },
  ];

  for (const interest of draft.interests) {
    entries.push({ name: "interests", value: interest });
  }
  for (const goal of draft.goals) {
    entries.push({ name: "goals", value: goal });
  }
  for (const preference of draft.preferences) {
    entries.push({ name: "preferences", value: preference });
  }

  return entries;
}

/** The inverse of `draftToFormEntries` — reads a submitted form back into the raw shape `onboardingSchema` validates. */
export function parseOnboardingFormData(formData: FormData): unknown {
  const gradeLevelRaw = formData.get("gradeLevel");
  const weeklyAvailabilityRaw = formData.get("weeklyAvailability");
  const experienceLevelRaw = formData.get("experienceLevel");

  return {
    preferredName: String(formData.get("preferredName") ?? ""),
    gradeLevel: gradeLevelRaw ? Number(gradeLevelRaw) : null,
    city: String(formData.get("city") ?? ""),
    state: String(formData.get("state") ?? ""),
    country: String(formData.get("country") ?? ""),
    interests: formData.getAll("interests").map(String),
    otherInterestText: String(formData.get("otherInterestText") ?? ""),
    goals: formData.getAll("goals").map(String),
    preferences: formData.getAll("preferences").map(String),
    weeklyAvailability: weeklyAvailabilityRaw ? String(weeklyAvailabilityRaw) : null,
    experienceLevel: experienceLevelRaw ? String(experienceLevelRaw) : null,
    guidedMode: formData.get("guidedMode") === "true",
  };
}

export const EMPTY_DRAFT: OnboardingDraft = {
  step: 0,
  preferredName: "",
  gradeLevel: null,
  city: "",
  state: "",
  country: UNITED_STATES,
  interests: [],
  otherInterestText: "",
  goals: [],
  preferences: [],
  weeklyAvailability: null,
  experienceLevel: null,
  guidedMode: false,
};

import { z } from "zod";

import type {
  ExperienceLevel,
  GoalValue,
  InterestValue,
  OpportunityPreferenceKey,
  WeeklyAvailability,
} from "@/types/database";
import {
  ALL_INTERESTS,
  GOALS,
  GRADE_LEVELS,
  PREFERENCE_GROUPS,
  UNITED_STATES,
} from "@/lib/onboarding/constants";

const ALL_PREFERENCE_KEYS: readonly OpportunityPreferenceKey[] =
  PREFERENCE_GROUPS.flatMap((group) => group.options.map((option) => option.value));

/** A string that must be one of `values`, narrowed to that literal union. */
function oneOf<T extends string>(values: readonly T[], message: string) {
  return z
    .string()
    .refine((value): value is T => (values as readonly string[]).includes(value), {
      message,
    });
}

/** Like `oneOf`, but also accepts (and rejects) `null` as "nothing chosen". */
function requiredOneOf<T extends string>(values: readonly T[], message: string) {
  return z
    .string()
    .nullable()
    .refine(
      (value): value is T => value !== null && (values as readonly string[]).includes(value),
      { message }
    );
}

export const preferredNameSchema = z
  .string()
  .trim()
  .min(1, "Enter your preferred name.")
  .max(100, "Preferred name must be 100 characters or fewer.");

export const gradeLevelSchema = z
  .number()
  .nullable()
  .refine((value): value is number => value !== null, {
    message: "Select your grade level.",
  })
  .refine(
    (value) => (GRADE_LEVELS as readonly number[]).includes(value),
    { message: "Grade level must be between 6 and 12." }
  );

const cityFieldSchema = z
  .string()
  .trim()
  .max(100, "City must be 100 characters or fewer.");

const stateFieldSchema = z
  .string()
  .trim()
  .max(100, "State must be 100 characters or fewer.");

const countryFieldSchema = z
  .string()
  .trim()
  .min(1, "Enter your country.")
  .max(100, "Country must be 100 characters or fewer.");

function checkUsLocation(
  data: { country: string; city: string; state: string },
  ctx: z.RefinementCtx
) {
  const isUnitedStates = data.country.trim().toLowerCase() === UNITED_STATES.toLowerCase();
  if (isUnitedStates && data.city.trim().length === 0) {
    ctx.addIssue({ code: "custom", message: "Enter your city.", path: ["city"] });
  }
  if (isUnitedStates && data.state.trim().length === 0) {
    ctx.addIssue({ code: "custom", message: "Enter your state.", path: ["state"] });
  }
}

export const step1Schema = z
  .object({
    preferredName: preferredNameSchema,
    gradeLevel: gradeLevelSchema,
    city: cityFieldSchema,
    state: stateFieldSchema,
    country: countryFieldSchema,
  })
  .superRefine(checkUsLocation);

export type Step1Data = z.infer<typeof step1Schema>;

const interestsFieldSchema = z
  .array(oneOf<InterestValue>(ALL_INTERESTS, "Select a valid interest."))
  .min(1, 'Select at least one interest, or choose "Not sure yet."');

const otherInterestTextFieldSchema = z
  .string()
  .trim()
  .max(100, "Please keep this under 100 characters.");

function checkOtherInterest(
  data: { interests: string[]; otherInterestText: string },
  ctx: z.RefinementCtx
) {
  if (data.interests.includes("Other") && data.otherInterestText.trim().length === 0) {
    ctx.addIssue({
      code: "custom",
      message: 'Tell us what "Other" means for you.',
      path: ["otherInterestText"],
    });
  }
}

export const step2Schema = z
  .object({
    interests: interestsFieldSchema,
    otherInterestText: otherInterestTextFieldSchema,
  })
  .superRefine(checkOtherInterest);

export type Step2Data = z.infer<typeof step2Schema>;

export const step3Schema = z.object({
  goals: z
    .array(oneOf<GoalValue>(GOALS, "Select a valid goal."))
    .min(1, "Select at least one goal."),
});

export type Step3Data = z.infer<typeof step3Schema>;

export const step4Schema = z.object({
  preferences: z.array(
    oneOf<OpportunityPreferenceKey>(ALL_PREFERENCE_KEYS, "Select a valid preference.")
  ),
});

export type Step4Data = z.infer<typeof step4Schema>;

export const step5Schema = z.object({
  weeklyAvailability: requiredOneOf<WeeklyAvailability>(
    ["less_than_2", "2_to_5", "5_to_10", "more_than_10", "varies", "not_sure"],
    "Select your weekly availability."
  ),
  experienceLevel: requiredOneOf<ExperienceLevel>(
    ["beginner", "some_experience", "experienced", "not_sure"],
    "Select your experience level."
  ),
  guidedMode: z.boolean(),
});

export type Step5Data = z.infer<typeof step5Schema>;

/** Full onboarding payload, validated once more server-side before saving. */
export const onboardingSchema = z
  .object({
    preferredName: preferredNameSchema,
    gradeLevel: gradeLevelSchema,
    city: cityFieldSchema,
    state: stateFieldSchema,
    country: countryFieldSchema,
    interests: interestsFieldSchema,
    otherInterestText: otherInterestTextFieldSchema,
    goals: step3Schema.shape.goals,
    preferences: step4Schema.shape.preferences,
    weeklyAvailability: step5Schema.shape.weeklyAvailability,
    experienceLevel: step5Schema.shape.experienceLevel,
    guidedMode: step5Schema.shape.guidedMode,
  })
  .superRefine(checkUsLocation)
  .superRefine(checkOtherInterest);

export type OnboardingData = z.infer<typeof onboardingSchema>;

import type {
  ExperienceLevel,
  GoalValue,
  InterestValue,
  OpportunityPreferenceKey,
  WeeklyAvailability,
} from "@/types/database";

export const ONBOARDING_VERSION = 1;

export const TOTAL_STEPS = 6;

export const GRADE_LEVELS = [6, 7, 8, 9, 10, 11, 12] as const;

export const UNITED_STATES = "United States";

export const INTEREST_CATEGORIES: readonly InterestValue[] = [
  "Business",
  "Entrepreneurship",
  "Technology",
  "Computer Science",
  "Engineering",
  "Medicine",
  "Public Health",
  "Psychology",
  "Law",
  "Government",
  "Environmental Science",
  "Biology",
  "Mathematics",
  "Writing",
  "Journalism",
  "Visual Arts",
  "Music",
  "Theater",
  "Filmmaking",
  "Sports",
  "Education",
  "Community Service",
  "Finance",
  "Design",
];

// Rendered after a divider, separate from the subject-matter categories above.
export const INTEREST_FALLBACKS: readonly InterestValue[] = [
  "Not sure yet",
  "Other",
];

export const ALL_INTERESTS: readonly InterestValue[] = [
  ...INTEREST_CATEGORIES,
  ...INTEREST_FALLBACKS,
];

export const GOALS: readonly GoalValue[] = [
  "Explore my interests",
  "Build a resume",
  "Find volunteer work",
  "Find a summer program",
  "Prepare for college",
  "Gain leadership experience",
  "Enter competitions",
  "Find an internship",
  "Explore research",
  "Improve a skill",
  "Complete a personal project",
];

export type PreferenceGroup = {
  id: string;
  label: string;
  description: string;
  options: { value: OpportunityPreferenceKey; label: string }[];
};

// Grouped so the step renders as several small, labeled choices instead of
// one long undifferentiated checkbox list.
export const PREFERENCE_GROUPS: readonly PreferenceGroup[] = [
  {
    id: "format",
    label: "Format",
    description: "How would you like to take part in opportunities?",
    options: [
      { value: "virtual", label: "Virtual" },
      { value: "in_person", label: "In person" },
      { value: "either", label: "Either is fine" },
    ],
  },
  {
    id: "cost",
    label: "Cost",
    description: "What kinds of cost are okay?",
    options: [
      { value: "free_only", label: "Free only" },
      { value: "paid_ok", label: "Paid opportunities are okay" },
    ],
  },
  {
    id: "scope",
    label: "Scope",
    description: "Where should opportunities be based?",
    options: [
      { value: "local", label: "Local" },
      { value: "national", label: "National" },
    ],
  },
  {
    id: "duration",
    label: "Duration",
    description: "How long should opportunities run?",
    options: [
      { value: "short_term", label: "Short-term" },
      { value: "year_round", label: "Year-round" },
      { value: "summer", label: "Summer" },
    ],
  },
  {
    id: "level",
    label: "Level",
    description: "What level should opportunities be aimed at?",
    options: [
      { value: "beginner_friendly", label: "Beginner-friendly" },
      { value: "advanced", label: "Advanced" },
    ],
  },
];

export const WEEKLY_AVAILABILITY_OPTIONS: {
  value: WeeklyAvailability;
  label: string;
}[] = [
  { value: "less_than_2", label: "Less than 2 hours" },
  { value: "2_to_5", label: "2–5 hours" },
  { value: "5_to_10", label: "5–10 hours" },
  { value: "more_than_10", label: "More than 10 hours" },
  { value: "varies", label: "Varies" },
  { value: "not_sure", label: "Not sure" },
];

export const EXPERIENCE_LEVEL_OPTIONS: {
  value: ExperienceLevel;
  label: string;
}[] = [
  { value: "beginner", label: "Beginner" },
  { value: "some_experience", label: "Some experience" },
  { value: "experienced", label: "Experienced" },
  { value: "not_sure", label: "Not sure" },
];

export const STEP_TITLES = [
  "Basic information",
  "Interests",
  "Current goals",
  "Opportunity preferences",
  "Availability and experience",
  "Review and complete",
] as const;

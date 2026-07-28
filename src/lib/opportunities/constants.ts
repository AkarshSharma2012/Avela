import type {
  OpportunityApplicationStatus,
  OpportunityCostType,
  OpportunityDeadlineStatus,
  OpportunityFormat,
  OpportunityType,
  OpportunityVerificationStatus,
  RecommendationFeedbackReason,
} from "@/types/database";

export const OPPORTUNITY_TYPES: readonly { value: OpportunityType; label: string }[] = [
  { value: "internship", label: "Internship" },
  { value: "competition", label: "Competition" },
  { value: "volunteer", label: "Volunteer" },
  { value: "summer_program", label: "Summer program" },
  { value: "research", label: "Research" },
  { value: "scholarship", label: "Scholarship" },
  { value: "club", label: "Club" },
];

export const OPPORTUNITY_FORMATS: readonly { value: OpportunityFormat; label: string }[] = [
  { value: "virtual", label: "Virtual" },
  { value: "in_person", label: "In person" },
  { value: "hybrid", label: "Hybrid" },
];

export const OPPORTUNITY_COST_TYPES: readonly { value: OpportunityCostType; label: string }[] = [
  { value: "free", label: "Free" },
  { value: "paid", label: "Paid" },
];

export type DeadlineWindow = "any" | "7d" | "30d" | "90d";

export const DEADLINE_WINDOWS: readonly { value: DeadlineWindow; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "7d", label: "Next 7 days" },
  { value: "30d", label: "Next 30 days" },
  { value: "90d", label: "Next 90 days" },
];

export const WEEKLY_HOURS_FILTER_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 2, label: "Up to 2 hrs/week" },
  { value: 5, label: "Up to 5 hrs/week" },
  { value: 10, label: "Up to 10 hrs/week" },
  { value: 20, label: "Up to 20 hrs/week" },
];

export const OPPORTUNITY_TYPE_VALUES: readonly OpportunityType[] = OPPORTUNITY_TYPES.map(
  (option) => option.value
);
export const OPPORTUNITY_FORMAT_VALUES: readonly OpportunityFormat[] = OPPORTUNITY_FORMATS.map(
  (option) => option.value
);
export const OPPORTUNITY_COST_TYPE_VALUES: readonly OpportunityCostType[] =
  OPPORTUNITY_COST_TYPES.map((option) => option.value);
export const DEADLINE_WINDOW_VALUES: readonly DeadlineWindow[] = DEADLINE_WINDOWS.map(
  (option) => option.value
);

export const PAGE_SIZE = 12;

/** Safety cap on the pool "Chosen for You" (chosen-for-you.ts) ranks in JS — same rationale as SEARCH_RERANK_LIMIT in query.ts: this catalog is small by design, but the cap keeps that assumption from silently breaking if it grows. */
export const MATCHING_POOL_LIMIT = 200;

export const TYPE_LABELS: Record<OpportunityType, string> = Object.fromEntries(
  OPPORTUNITY_TYPES.map((option) => [option.value, option.label])
) as Record<OpportunityType, string>;

export const FORMAT_LABELS: Record<OpportunityFormat, string> = Object.fromEntries(
  OPPORTUNITY_FORMATS.map((option) => [option.value, option.label])
) as Record<OpportunityFormat, string>;

// Milestone 5 — discovery/verification labels and filter toggles

export const VERIFICATION_STATUS_LABELS: Record<OpportunityVerificationStatus, string> = {
  unverified: "Unverified",
  partially_verified: "Partially verified",
  verified: "Verified",
  stale: "Stale",
  rejected: "Rejected",
};

export const DEADLINE_STATUS_LABELS: Record<OpportunityDeadlineStatus, string> = {
  open: "Open",
  rolling: "Rolling admissions",
  upcoming: "Opening soon",
  closed: "Closed",
  unknown: "Deadline unknown",
};

export const APPLICATION_STATUS_LABELS: Record<OpportunityApplicationStatus, string> = {
  accepting_applications: "Accepting applications",
  opening_soon: "Opening soon",
  closed: "Closed",
  unknown: "Status unknown",
};

export type DiscoveryFilterToggle = {
  value:
    | "verifiedOnly"
    | "eligibleOnly"
    | "acceptingOnly"
    | "rollingOnly"
    | "openingSoonOnly"
    | "includeUnclearEligibility";
  paramName: string;
  label: string;
};

// Recommendation Feedback Loop

export const DISMISS_REASONS: readonly { value: RecommendationFeedbackReason; label: string }[] = [
  { value: "not_interested", label: "Not interested" },
  { value: "too_expensive", label: "Too expensive" },
  { value: "too_far", label: "Too far away" },
  { value: "wrong_timing", label: "Bad timing" },
  { value: "too_competitive", label: "Too competitive" },
  { value: "wrong_format", label: "Wrong format" },
  { value: "eligibility_mismatch", label: "I might not be eligible" },
  { value: "already_applied", label: "Already applied" },
  { value: "other", label: "Other" },
];

export const DISCOVERY_FILTER_TOGGLES: readonly DiscoveryFilterToggle[] = [
  { value: "verifiedOnly", paramName: "verified", label: "Verified only" },
  { value: "eligibleOnly", paramName: "eligible", label: "Eligible only" },
  { value: "acceptingOnly", paramName: "accepting", label: "Accepting applications" },
  { value: "rollingOnly", paramName: "rolling", label: "Rolling admissions" },
  { value: "openingSoonOnly", paramName: "openingSoon", label: "Opening soon" },
  { value: "includeUnclearEligibility", paramName: "includeUnclear", label: "Include unclear eligibility" },
];

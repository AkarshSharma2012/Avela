import type { ApplicationPlanStatus } from "@/types/database";
import type { OpportunityType } from "@/types/database";

export const APPLICATION_STATUSES: readonly { value: ApplicationPlanStatus; label: string }[] = [
  { value: "interested", label: "Interested" },
  { value: "planning", label: "Planning" },
  { value: "preparing", label: "Preparing" },
  { value: "ready_to_apply", label: "Ready to apply" },
  { value: "applied", label: "Applied" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Not accepted" },
  { value: "withdrawn", label: "Withdrawn" },
];

export const APPLICATION_STATUS_LABELS: Record<ApplicationPlanStatus, string> = Object.fromEntries(
  APPLICATION_STATUSES.map((option) => [option.value, option.label])
) as Record<ApplicationPlanStatus, string>;

/** Still being worked on, not yet sent — the Application Center's "active" bucket and the dashboard's "active application count". */
export const ACTIVE_APPLICATION_STATUSES: ReadonlySet<ApplicationPlanStatus> = new Set([
  "interested",
  "planning",
  "preparing",
  "ready_to_apply",
]);

/** Sent (or deliberately dropped) — the Application Center's "completed/submitted" bucket. A decision (accepted/rejected) always implies applied first. */
export const DONE_APPLICATION_STATUSES: ReadonlySet<ApplicationPlanStatus> = new Set([
  "applied",
  "accepted",
  "rejected",
  "withdrawn",
]);

export function isActiveApplicationStatus(status: ApplicationPlanStatus): boolean {
  return ACTIVE_APPLICATION_STATUSES.has(status);
}

export function isDoneApplicationStatus(status: ApplicationPlanStatus): boolean {
  return DONE_APPLICATION_STATUSES.has(status);
}

// Starter task suggestions ---------------------------------------------------

export type StarterTask = { title: string; description: string };

/**
 * Every opportunity type gets the same handful of universal steps (checking
 * eligibility, reading requirements, gathering documents, a final review,
 * and submitting) plus a type-specific subset of the heavier prep tasks —
 * a club sign-up and a research program don't need the same checklist, and
 * suggesting one to the other would be a fabricated requirement, not a
 * real one. These are starting points only: the workspace lets a student
 * edit or delete any of them, and add their own.
 */
const UNIVERSAL_TASKS: readonly StarterTask[] = [
  { title: "Review eligibility", description: "Double-check the grade, age, and residency requirements." },
  { title: "Read the official requirements", description: "Look over what the organization actually asks for on their own site." },
  { title: "Collect required documents", description: "Gather anything you'll need to attach — transcript, ID, forms, etc." },
  { title: "Review your application", description: "Read everything once more before it goes in." },
  { title: "Submit your application", description: "Send it in before the deadline." },
];

const RESUME_TASK: StarterTask = {
  title: "Prepare your resume",
  description: "Put together a simple resume or activity list to reference or attach.",
};
const RECOMMENDATION_TASK: StarterTask = {
  title: "Request a recommendation",
  description: "Ask a teacher, coach, or mentor early — they'll need time to write it.",
};
const ESSAY_TASK: StarterTask = {
  title: "Draft your essay or response",
  description: "Write a first draft, then leave time to revise it.",
};
const INTERVIEW_TASK: StarterTask = {
  title: "Prepare for an interview",
  description: "Practice talking through why you're interested and what you'd bring.",
};

/** Which of the optional prep tasks typically apply to each opportunity type — a starting guess, not a guarantee; real per-listing flags (see below) override it when known. */
const TYPE_TASK_DEFAULTS: Record<OpportunityType, { resume: boolean; recommendation: boolean; essay: boolean; interview: boolean }> = {
  internship: { resume: true, recommendation: false, essay: false, interview: true },
  competition: { resume: false, recommendation: false, essay: true, interview: false },
  volunteer: { resume: false, recommendation: false, essay: false, interview: false },
  summer_program: { resume: true, recommendation: true, essay: true, interview: false },
  research: { resume: true, recommendation: true, essay: true, interview: true },
  scholarship: { resume: true, recommendation: true, essay: true, interview: false },
  club: { resume: false, recommendation: false, essay: false, interview: false },
};

/** Known per-listing requirement flags (see detail-extraction.ts), when available — `null`/`undefined` means "unknown", and falls back to the type default rather than being treated as "not required". */
export type StarterTaskOpportunityFlags = {
  essayRequired?: boolean | null;
  recommendationRequired?: boolean | null;
  interviewRequired?: boolean | null;
};

export function suggestStarterTasks(
  opportunityType: OpportunityType,
  flags: StarterTaskOpportunityFlags = {}
): StarterTask[] {
  const typeDefaults = TYPE_TASK_DEFAULTS[opportunityType];
  const wantsResume = typeDefaults.resume;
  const wantsRecommendation = flags.recommendationRequired ?? typeDefaults.recommendation;
  const wantsEssay = flags.essayRequired ?? typeDefaults.essay;
  const wantsInterview = flags.interviewRequired ?? typeDefaults.interview;

  const prep: StarterTask[] = [];
  if (wantsResume) prep.push(RESUME_TASK);
  if (wantsRecommendation) prep.push(RECOMMENDATION_TASK);
  if (wantsEssay) prep.push(ESSAY_TASK);
  if (wantsInterview) prep.push(INTERVIEW_TASK);

  return [...UNIVERSAL_TASKS.slice(0, 2), ...prep, ...UNIVERSAL_TASKS.slice(2)];
}

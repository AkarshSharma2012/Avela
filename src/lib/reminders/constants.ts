import type { ReminderSource, ReminderType } from "@/types/database";

export const REMINDER_TYPES: readonly { value: ReminderType; label: string }[] = [
  { value: "opportunity_deadline", label: "Opportunity deadline" },
  { value: "target_submit_date", label: "Your target date" },
  { value: "application_task", label: "Application task" },
  { value: "recommendation_reminder", label: "Remind me later" },
  { value: "follow_up", label: "Follow-up" },
  { value: "custom", label: "Custom reminder" },
];

export const REMINDER_TYPE_LABELS: Record<ReminderType, string> = Object.fromEntries(
  REMINDER_TYPES.map((option) => [option.value, option.label])
) as Record<ReminderType, string>;

/** reminder_type -> source, mirrors the migration's `student_reminders_type_source` check constraint exactly — kept here so app code never has to guess which source a given type should carry. */
export const REMINDER_TYPE_SOURCE: Record<ReminderType, ReminderSource> = {
  opportunity_deadline: "automatic",
  target_submit_date: "application_plan",
  application_task: "application_task",
  recommendation_reminder: "recommendation_feedback",
  custom: "student_created",
  follow_up: "student_created",
};

export const REMINDER_SOURCE_LABELS: Record<ReminderSource, string> = {
  automatic: "Automatic",
  student_created: "Added by you",
  recommendation_feedback: "“Remind me later”",
  application_plan: "Your application plan",
  application_task: "An application task",
};

export type TimingOffsetsConfig = {
  opportunity_deadline: readonly number[];
  target_submit_date: readonly number[];
  application_task: readonly number[];
};

/**
 * Default days-before timing for automatically generated reminders (spec
 * section 9) — a plain data object, not hardcoded into the generation
 * logic, so a future settings screen could make this per-student without
 * touching reminders/sync.ts.
 */
export const DEFAULT_REMINDER_TIMING: TimingOffsetsConfig = {
  opportunity_deadline: [14, 3],
  target_submit_date: [7, 1],
  application_task: [3, 0],
};

export type SnoozePreset = "tomorrow" | "three_days" | "next_week";

export const SNOOZE_PRESET_DAYS: Record<SnoozePreset, number> = {
  tomorrow: 1,
  three_days: 3,
  next_week: 7,
};

export const SNOOZE_OPTIONS: readonly { value: SnoozePreset | "custom"; label: string }[] = [
  { value: "tomorrow", label: "Tomorrow" },
  { value: "three_days", label: "In 3 days" },
  { value: "next_week", label: "Next week" },
  { value: "custom", label: "Pick a date" },
];

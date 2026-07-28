/**
 * Reminder generation/synchronization (spec section 2). The `build*`
 * functions below are pure — no Supabase, so "does a due-date change
 * produce the right reminder occurrence" is unit-testable without a
 * database — while `synchronizeRemindersForUser` and the targeted
 * `sync*` helpers are the only things that actually talk to Postgres,
 * reconciling live plan/task/feedback state against what's already
 * stored (insert what's missing, update what a student-controlled date
 * change moved, leave a student's own completions/dismissals alone,
 * delete what's gone stale) via the same dedupe_key every automatic
 * reminder carries.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { isActiveApplicationStatus } from "@/lib/applications/constants";
import { getApplicationPlans } from "@/lib/applications/repository";
import { formatShortDate } from "@/lib/opportunities/format";
import { DEFAULT_REMINDER_TIMING } from "@/lib/reminders/constants";
import { computeAutomaticReminderOccurrences } from "@/lib/reminders/intelligence";
import {
  type AutomaticReminderWrite,
  deleteRemindersByIds,
  insertAutomaticReminder,
  listAutomaticRemindersByDedupeKey,
  listRemindLaterFeedback,
  updateAutomaticReminderDate,
} from "@/lib/reminders/repository";
import type { Database } from "@/types/database";
import type { StudentReminder } from "@/types/reminder";

type Client = SupabaseClient<Database>;

function dedupeKey(...parts: (string | number)[]): string {
  return parts.join(":");
}

// --- Pure builders ---------------------------------------------------------

export type PlanForReminders = {
  planId: string;
  opportunityId: string;
  opportunityTitle: string;
  isActiveStatus: boolean;
  officialDeadline: string | null;
  targetSubmitDate: string | null;
};

export type TaskForReminders = {
  taskId: string;
  planId: string;
  opportunityTitle: string;
  title: string;
  dueDate: string | null;
  completedAt: string | null;
};

export type RemindLaterForReminders = {
  opportunityId: string;
  opportunityTitle: string;
  reminderAt: string;
};

/** One reminder occurrence per configured offset before a plan's frozen official_deadline snapshot — never the opportunity's live `application_deadline`, so a later re-verification can't silently move a reminder that's already been shown to a student. */
export function buildOpportunityDeadlineReminders(
  plans: readonly PlanForReminders[],
  now: Date = new Date()
): AutomaticReminderWrite[] {
  const writes: AutomaticReminderWrite[] = [];
  for (const plan of plans) {
    if (!plan.officialDeadline) continue;
    for (const occurrence of computeAutomaticReminderOccurrences(
      plan.officialDeadline,
      DEFAULT_REMINDER_TIMING.opportunity_deadline,
      now
    )) {
      writes.push({
        dedupeKey: dedupeKey("opportunity_deadline", plan.opportunityId, occurrence.offsetDays),
        reminderType: "opportunity_deadline",
        source: "automatic",
        title: `Deadline: ${plan.opportunityTitle}`,
        message: `Applications for ${plan.opportunityTitle} are due ${formatShortDate(plan.officialDeadline)}.`,
        remindAt: occurrence.remindAt,
        opportunityId: plan.opportunityId,
        applicationPlanId: plan.planId,
        applicationTaskId: null,
      });
    }
  }
  return writes;
}

/** Only for plans still in an active (not applied/decided/withdrawn) status — once a plan has left the active workflow, its own target date no longer needs a reminder. */
export function buildTargetSubmitDateReminders(
  plans: readonly PlanForReminders[],
  now: Date = new Date()
): AutomaticReminderWrite[] {
  const writes: AutomaticReminderWrite[] = [];
  for (const plan of plans) {
    if (!plan.isActiveStatus || !plan.targetSubmitDate) continue;
    for (const occurrence of computeAutomaticReminderOccurrences(
      plan.targetSubmitDate,
      DEFAULT_REMINDER_TIMING.target_submit_date,
      now
    )) {
      writes.push({
        dedupeKey: dedupeKey("target_submit_date", plan.planId, occurrence.offsetDays),
        reminderType: "target_submit_date",
        source: "application_plan",
        title: `Your target date: ${plan.opportunityTitle}`,
        message: `You planned to submit by ${formatShortDate(plan.targetSubmitDate)}.`,
        remindAt: occurrence.remindAt,
        opportunityId: plan.opportunityId,
        applicationPlanId: plan.planId,
        applicationTaskId: null,
      });
    }
  }
  return writes;
}

/** Only for tasks that still have an open due date — a completed task produces zero occurrences here, which is how "completing a task hides its reminder" holds even before `syncTaskCompletion` (below) explicitly marks the existing row done. */
export function buildApplicationTaskReminders(
  tasks: readonly TaskForReminders[],
  now: Date = new Date()
): AutomaticReminderWrite[] {
  const writes: AutomaticReminderWrite[] = [];
  for (const task of tasks) {
    if (task.completedAt !== null || !task.dueDate) continue;
    for (const occurrence of computeAutomaticReminderOccurrences(
      task.dueDate,
      DEFAULT_REMINDER_TIMING.application_task,
      now
    )) {
      writes.push({
        dedupeKey: dedupeKey("application_task", task.taskId, occurrence.offsetDays),
        reminderType: "application_task",
        source: "application_task",
        title: task.title,
        message: `Part of your ${task.opportunityTitle} application.`,
        remindAt: occurrence.remindAt,
        opportunityId: null,
        applicationPlanId: task.planId,
        applicationTaskId: task.taskId,
      });
    }
  }
  return writes;
}

/** One reminder per "remind me later" feedback row — no offsets, since the student already chose the exact time (see feedback.ts's `remindMeLater`/opportunity detail's date picker). */
export function buildRecommendationReminders(
  feedback: readonly RemindLaterForReminders[],
  now: Date = new Date()
): AutomaticReminderWrite[] {
  const writes: AutomaticReminderWrite[] = [];
  for (const entry of feedback) {
    if (new Date(entry.reminderAt).getTime() <= now.getTime()) continue;
    writes.push({
      dedupeKey: dedupeKey("recommendation_reminder", entry.opportunityId),
      reminderType: "recommendation_reminder",
      source: "recommendation_feedback",
      title: `Revisit: ${entry.opportunityTitle}`,
      message: "You asked to be reminded about this opportunity.",
      remindAt: new Date(entry.reminderAt).toISOString(),
      opportunityId: entry.opportunityId,
      applicationPlanId: null,
      applicationTaskId: null,
    });
  }
  return writes;
}

// --- Reconciliation (Supabase) ---------------------------------------------

/**
 * Diffs a freshly-computed "what should exist" list against what's
 * already stored (keyed by dedupe_key) and applies the minimum writes:
 * insert what's missing, update remind_at/title/message for a pending
 * (not completed/dismissed) reminder whose source date moved, leave
 * opportunity_deadline rows and anything the student has already acted
 * on untouched, and — when `removeStale` — delete pending rows whose
 * source no longer produces them at all (task due date cleared, plan
 * moved out of active status, etc.).
 */
async function applyReminderDiff(
  supabase: Client,
  userId: string,
  desired: readonly AutomaticReminderWrite[],
  existingByDedupeKey: ReadonlyMap<string, StudentReminder>,
  options: { removeStale: boolean }
): Promise<{ error: string | null }> {
  const desiredKeys = new Set(desired.map((write) => write.dedupeKey));
  const toInsert: AutomaticReminderWrite[] = [];
  const toUpdate: { id: string; write: AutomaticReminderWrite }[] = [];

  for (const write of desired) {
    const existing = existingByDedupeKey.get(write.dedupeKey);
    if (!existing) {
      toInsert.push(write);
      continue;
    }
    if (write.reminderType === "opportunity_deadline") continue;
    if (existing.completed_at !== null || existing.dismissed_at !== null) continue;
    if (
      existing.remind_at !== write.remindAt ||
      existing.title !== write.title ||
      existing.message !== write.message
    ) {
      toUpdate.push({ id: existing.id, write });
    }
  }

  const toDelete: string[] = [];
  if (options.removeStale) {
    for (const [key, existing] of existingByDedupeKey) {
      if (desiredKeys.has(key)) continue;
      if (existing.reminder_type === "opportunity_deadline") continue;
      const isDone = existing.completed_at !== null || existing.dismissed_at !== null;
      if (isDone && existing.reminder_type !== "recommendation_reminder") continue;
      toDelete.push(existing.id);
    }
  }

  const results = await Promise.all([
    ...toInsert.map((write) => insertAutomaticReminder(supabase, userId, write)),
    ...toUpdate.map(({ id, write }) =>
      updateAutomaticReminderDate(supabase, userId, id, {
        remindAt: write.remindAt,
        title: write.title,
        message: write.message,
      })
    ),
  ]);
  if (toDelete.length > 0) await deleteRemindersByIds(supabase, userId, toDelete);

  return { error: results.find((result) => result.error)?.error ?? null };
}

/**
 * Full resync for a user — reads every plan/task/feedback row that can
 * produce an automatic reminder and reconciles all of it in one pass.
 * Safe and idempotent to call on every Reminder Center / dashboard page
 * load: a repeat call with nothing changed produces zero writes.
 */
export async function synchronizeRemindersForUser(
  supabase: Client,
  userId: string,
  now: Date = new Date()
): Promise<{ error: string | null }> {
  const [planBundles, existingByDedupeKey, remindLaterFeedback] = await Promise.all([
    getApplicationPlans(supabase, userId),
    listAutomaticRemindersByDedupeKey(supabase, userId),
    listRemindLaterFeedback(supabase, userId),
  ]);

  const opportunityTitleById = new Map<string, string>();
  for (const bundle of planBundles) opportunityTitleById.set(bundle.opportunity.id, bundle.opportunity.title);

  const missingOpportunityIds = [...new Set(remindLaterFeedback.map((row) => row.opportunityId))].filter(
    (id) => !opportunityTitleById.has(id)
  );
  if (missingOpportunityIds.length > 0) {
    const { data, error } = await supabase.from("opportunities").select("id, title").in("id", missingOpportunityIds);
    if (error) console.error("[reminders] failed to load feedback opportunity titles:", error.message);
    for (const row of data ?? []) opportunityTitleById.set(row.id, row.title);
  }

  const plansForReminders: PlanForReminders[] = planBundles.map((bundle) => ({
    planId: bundle.plan.id,
    opportunityId: bundle.opportunity.id,
    opportunityTitle: bundle.opportunity.title,
    isActiveStatus: isActiveApplicationStatus(bundle.plan.status),
    officialDeadline: bundle.plan.official_deadline,
    targetSubmitDate: bundle.plan.target_submit_date,
  }));

  const tasksForReminders: TaskForReminders[] = planBundles.flatMap((bundle) =>
    bundle.tasks.map((task) => ({
      taskId: task.id,
      planId: bundle.plan.id,
      opportunityTitle: bundle.opportunity.title,
      title: task.title,
      dueDate: task.due_date,
      completedAt: task.completed_at,
    }))
  );

  const feedbackForReminders: RemindLaterForReminders[] = remindLaterFeedback.map((row) => ({
    opportunityId: row.opportunityId,
    opportunityTitle: opportunityTitleById.get(row.opportunityId) ?? "this opportunity",
    reminderAt: row.reminderAt,
  }));

  const desired = [
    ...buildOpportunityDeadlineReminders(plansForReminders, now),
    ...buildTargetSubmitDateReminders(plansForReminders, now),
    ...buildApplicationTaskReminders(tasksForReminders, now),
    ...buildRecommendationReminders(feedbackForReminders, now),
  ];

  return applyReminderDiff(supabase, userId, desired, existingByDedupeKey, { removeStale: true });
}

async function loadExistingByDedupeKey(
  supabase: Client,
  userId: string,
  column: "application_task_id" | "application_plan_id" | "opportunity_id",
  id: string,
  source: Database["public"]["Tables"]["student_reminders"]["Row"]["source"]
): Promise<Map<string, StudentReminder>> {
  const { data, error } = await supabase
    .from("student_reminders")
    .select("*")
    .eq("user_id", userId)
    .eq(column, id)
    .eq("source", source);

  if (error) {
    console.error("[reminders] failed to load reminders for targeted sync:", error.message);
    return new Map();
  }
  return new Map((data ?? []).filter((row) => row.dedupe_key !== null).map((row) => [row.dedupe_key as string, row]));
}

/** Called right after a task's due date changes — recomputes just that task's occurrences and reconciles them immediately, rather than waiting for the next full page-load resync (spec section 2: "changing a task date updates its reminder"). */
export async function syncTaskReminders(
  supabase: Client,
  userId: string,
  task: TaskForReminders,
  now: Date = new Date()
): Promise<void> {
  const desired = buildApplicationTaskReminders([task], now);
  const existing = await loadExistingByDedupeKey(supabase, userId, "application_task_id", task.taskId, "application_task");
  await applyReminderDiff(supabase, userId, desired, existing, { removeStale: true });
}

/** Marks (or reopens) every reminder tied to a task — automatic ones and any custom reminder a student attached to it — matching the task's own completion state (spec section 2 & 6: "completing a task completes or hides its reminder"). */
export async function syncTaskCompletion(
  supabase: Client,
  userId: string,
  taskId: string,
  completedAt: string | null
): Promise<void> {
  const { error } = await supabase
    .from("student_reminders")
    .update({ completed_at: completedAt })
    .eq("user_id", userId)
    .eq("application_task_id", taskId)
    .is("dismissed_at", null);
  if (error) console.error("[reminders] failed to sync task completion to its reminders:", error.message);
}

/** Called right after a plan's target submit date changes (spec section 2: "changing target submit date updates the reminder"). */
export async function syncPlanTargetReminders(
  supabase: Client,
  userId: string,
  plan: PlanForReminders,
  now: Date = new Date()
): Promise<void> {
  const desired = buildTargetSubmitDateReminders([plan], now);
  const existing = await loadExistingByDedupeKey(supabase, userId, "application_plan_id", plan.planId, "application_plan");
  await applyReminderDiff(supabase, userId, desired, existing, { removeStale: true });
}

/** Called right after a "remind me later" feedback row is written or removed — mirrors it into student_reminders (or clears it out) immediately, reusing the same recommendation-feedback data rather than a second, independent reminder record. */
export async function syncRecommendationReminder(
  supabase: Client,
  userId: string,
  entry: RemindLaterForReminders | { opportunityId: string; opportunityTitle: null; reminderAt: null }
): Promise<void> {
  const desired = entry.reminderAt ? buildRecommendationReminders([entry as RemindLaterForReminders]) : [];
  const existing = await loadExistingByDedupeKey(
    supabase,
    userId,
    "opportunity_id",
    entry.opportunityId,
    "recommendation_feedback"
  );
  await applyReminderDiff(supabase, userId, desired, existing, { removeStale: true });
}

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CreateCustomReminderInput } from "@/lib/reminders/validation";
import type { Database, ReminderSource, ReminderType } from "@/types/database";
import type { StudentReminder } from "@/types/reminder";

type Client = SupabaseClient<Database>;

export async function listRemindersForUser(supabase: Client, userId: string): Promise<StudentReminder[]> {
  const { data, error } = await supabase
    .from("student_reminders")
    .select("*")
    .eq("user_id", userId)
    .order("remind_at", { ascending: true });

  if (error) {
    console.error("[reminders] failed to load reminders:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getReminderForUser(
  supabase: Client,
  userId: string,
  reminderId: string
): Promise<StudentReminder | null> {
  const { data, error } = await supabase
    .from("student_reminders")
    .select("*")
    .eq("user_id", userId)
    .eq("id", reminderId)
    .maybeSingle();

  if (error) {
    console.error("[reminders] failed to load reminder:", error.message);
    return null;
  }
  return data;
}

export async function listRemindersForPlan(
  supabase: Client,
  userId: string,
  applicationPlanId: string
): Promise<StudentReminder[]> {
  const { data, error } = await supabase
    .from("student_reminders")
    .select("*")
    .eq("user_id", userId)
    .eq("application_plan_id", applicationPlanId)
    .order("remind_at", { ascending: true });

  if (error) {
    console.error("[reminders] failed to load plan reminders:", error.message);
    return [];
  }
  return data ?? [];
}

export async function listRemindersForOpportunity(
  supabase: Client,
  userId: string,
  opportunityId: string
): Promise<StudentReminder[]> {
  const { data, error } = await supabase
    .from("student_reminders")
    .select("*")
    .eq("user_id", userId)
    .eq("opportunity_id", opportunityId)
    .order("remind_at", { ascending: true });

  if (error) {
    console.error("[reminders] failed to load opportunity reminders:", error.message);
    return [];
  }
  return data ?? [];
}

export async function insertCustomReminder(
  supabase: Client,
  userId: string,
  input: CreateCustomReminderInput & { source: "student_created" }
): Promise<{ reminderId: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from("student_reminders")
    .insert({
      user_id: userId,
      opportunity_id: input.opportunityId ?? null,
      application_plan_id: input.applicationPlanId ?? null,
      application_task_id: input.applicationTaskId ?? null,
      reminder_type: input.reminderType ?? "custom",
      title: input.title.trim(),
      message: input.message ?? null,
      remind_at: input.remindAt,
      source: input.source,
    })
    .select("id")
    .single();

  if (error) return { reminderId: null, error: error.message };
  return { reminderId: data.id, error: null };
}

export async function updateReminderCompletion(
  supabase: Client,
  userId: string,
  reminderId: string,
  completedAt: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("student_reminders")
    .update({ completed_at: completedAt })
    .eq("user_id", userId)
    .eq("id", reminderId);
  return { error: error?.message ?? null };
}

export async function updateReminderDismissal(
  supabase: Client,
  userId: string,
  reminderId: string,
  dismissedAt: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("student_reminders")
    .update({ dismissed_at: dismissedAt })
    .eq("user_id", userId)
    .eq("id", reminderId);
  return { error: error?.message ?? null };
}

export async function updateReminderSnooze(
  supabase: Client,
  userId: string,
  reminderId: string,
  snoozedUntil: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("student_reminders")
    .update({ snoozed_until: snoozedUntil })
    .eq("user_id", userId)
    .eq("id", reminderId);
  return { error: error?.message ?? null };
}

// --- Sync support --------------------------------------------------------
// Everything below is used only by reminders/sync.ts to reconcile
// automatically-generated reminders against their live source data
// (plans, tasks, recommendation feedback). Never called with
// client-supplied input.

export type AutomaticReminderWrite = {
  dedupeKey: string;
  reminderType: ReminderType;
  source: ReminderSource;
  title: string;
  message: string | null;
  remindAt: string;
  opportunityId: string | null;
  applicationPlanId: string | null;
  applicationTaskId: string | null;
};

/** Every non-student-created reminder this user has, keyed by its dedupe_key — the map sync.ts diffs the freshly-computed desired set against. */
export async function listAutomaticRemindersByDedupeKey(
  supabase: Client,
  userId: string
): Promise<Map<string, StudentReminder>> {
  const { data, error } = await supabase
    .from("student_reminders")
    .select("*")
    .eq("user_id", userId)
    .not("dedupe_key", "is", null);

  if (error) {
    console.error("[reminders] failed to load automatic reminders:", error.message);
    return new Map();
  }

  return new Map((data ?? []).filter((row) => row.dedupe_key !== null).map((row) => [row.dedupe_key as string, row]));
}

export async function insertAutomaticReminder(
  supabase: Client,
  userId: string,
  write: AutomaticReminderWrite
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("student_reminders").insert({
    user_id: userId,
    opportunity_id: write.opportunityId,
    application_plan_id: write.applicationPlanId,
    application_task_id: write.applicationTaskId,
    reminder_type: write.reminderType,
    title: write.title,
    message: write.message,
    remind_at: write.remindAt,
    source: write.source,
    dedupe_key: write.dedupeKey,
  });
  return { error: error?.message ?? null };
}

/** Updates only the fields a source-of-truth change can legitimately move — never touches completed_at/dismissed_at/snoozed_until, which stay entirely under the student's own control. */
export async function updateAutomaticReminderDate(
  supabase: Client,
  userId: string,
  reminderId: string,
  patch: { remindAt: string; title: string; message: string | null }
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("student_reminders")
    .update({ remind_at: patch.remindAt, title: patch.title, message: patch.message })
    .eq("user_id", userId)
    .eq("id", reminderId);
  return { error: error?.message ?? null };
}

export async function deleteRemindersByIds(supabase: Client, userId: string, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from("student_reminders").delete().eq("user_id", userId).in("id", [...ids]);
  if (error) console.error("[reminders] failed to delete stale reminders:", error.message);
}

/** "Remind me later" recommendation feedback rows with a reminder time set — what recommendation_reminder rows are synced from. Two-step fetch (feedback, then opportunities) for the same reason getApplicationPlans documents in applications/repository.ts. */
export async function listRemindLaterFeedback(
  supabase: Client,
  userId: string
): Promise<{ opportunityId: string; reminderAt: string }[]> {
  const { data, error } = await supabase
    .from("recommendation_feedback")
    .select("opportunity_id, reminder_at")
    .eq("user_id", userId)
    .eq("feedback_type", "remind_later")
    .not("reminder_at", "is", null);

  if (error) {
    console.error("[reminders] failed to load remind-later feedback:", error.message);
    return [];
  }

  return (data ?? [])
    .filter((row): row is { opportunity_id: string; reminder_at: string } => row.reminder_at !== null)
    .map((row) => ({ opportunityId: row.opportunity_id, reminderAt: row.reminder_at }));
}

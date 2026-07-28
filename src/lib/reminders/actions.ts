"use server";

import { revalidatePath } from "next/cache";

import { getApplicationPlan } from "@/lib/applications/repository";
import { getAuthenticatedUser } from "@/lib/auth/dal";
import * as repo from "@/lib/reminders/repository";
import { synchronizeRemindersForUser } from "@/lib/reminders/sync";
import {
  completeReminderForUser,
  createCustomReminderForUser,
  dismissReminderForUser,
  reopenReminderForUser,
  snoozeReminderForUser,
  type CreateCustomReminderInput,
} from "@/lib/reminders/validation";
import { createClient } from "@/lib/supabase/server";

export type ReminderActionResult = { error?: string };
export type CreateReminderActionResult = { reminderId?: string; error?: string };

function revalidateReminderPages(planId?: string | null) {
  revalidatePath("/reminders");
  revalidatePath("/dashboard");
  if (planId) revalidatePath(`/applications/${planId}`);
}

/**
 * Verifies any target the client claims a new custom reminder is attached
 * to actually belongs to this student before it's ever written — RLS is
 * the real backstop (student_reminders has no FK-ownership cross-check
 * policy like application_tasks does, since opportunity_id/plan_id/task_id
 * are all independently nullable), but a friendly, specific error here
 * beats a raw insert failure.
 */
async function verifyReminderTargets(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  input: CreateCustomReminderInput
): Promise<string | null> {
  if (input.applicationPlanId) {
    const plan = await getApplicationPlan(supabase, userId, input.applicationPlanId);
    if (!plan) return "Couldn't find that application.";
  }
  if (input.applicationTaskId) {
    const { data, error } = await supabase
      .from("application_tasks")
      .select("id")
      .eq("user_id", userId)
      .eq("id", input.applicationTaskId)
      .maybeSingle();
    if (error || !data) return "Couldn't find that task.";
  }
  if (input.opportunityId) {
    const { data, error } = await supabase
      .from("opportunities")
      .select("id")
      .eq("id", input.opportunityId)
      .maybeSingle();
    if (error || !data) return "Couldn't find that opportunity.";
  }
  return null;
}

export async function createCustomReminder(input: CreateCustomReminderInput): Promise<CreateReminderActionResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in to set a reminder." };

  const supabase = await createClient();
  const targetError = await verifyReminderTargets(supabase, user.id, input);
  if (targetError) return { error: targetError };

  const result = await createCustomReminderForUser(user.id, input, (userId, write) =>
    repo.insertCustomReminder(supabase, userId, write)
  );

  if (!result.success) return { error: result.error };
  revalidateReminderPages(input.applicationPlanId);
  return { reminderId: result.reminderId };
}

export async function completeReminder(reminderId: string): Promise<ReminderActionResult> {
  const user = await getAuthenticatedUser();
  const supabase = await createClient();

  const result = await completeReminderForUser(user?.id ?? null, reminderId, async (userId, id) =>
    repo.updateReminderCompletion(supabase, userId, id, new Date().toISOString())
  );

  if (!result.success) return { error: result.error };
  revalidateReminderPages();
  return {};
}

export async function reopenReminder(reminderId: string): Promise<ReminderActionResult> {
  const user = await getAuthenticatedUser();
  const supabase = await createClient();

  const result = await reopenReminderForUser(user?.id ?? null, reminderId, async (userId, id) =>
    repo.updateReminderCompletion(supabase, userId, id, null)
  );

  if (!result.success) return { error: result.error };
  revalidateReminderPages();
  return {};
}

export async function dismissReminder(reminderId: string): Promise<ReminderActionResult> {
  const user = await getAuthenticatedUser();
  const supabase = await createClient();

  const result = await dismissReminderForUser(user?.id ?? null, reminderId, async (userId, id) =>
    repo.updateReminderDismissal(supabase, userId, id, new Date().toISOString())
  );

  if (!result.success) return { error: result.error };
  revalidateReminderPages();
  return {};
}

/** Undoes a dismiss — separate from `reopenReminder` (which undoes a completion) since the two are independent states a reminder card can be in. */
export async function undismissReminder(reminderId: string): Promise<ReminderActionResult> {
  const user = await getAuthenticatedUser();
  const supabase = await createClient();

  const result = await dismissReminderForUser(user?.id ?? null, reminderId, async (userId, id) =>
    repo.updateReminderDismissal(supabase, userId, id, null)
  );

  if (!result.success) return { error: result.error };
  revalidateReminderPages();
  return {};
}

export async function snoozeReminder(reminderId: string, snoozedUntil: string): Promise<ReminderActionResult> {
  const user = await getAuthenticatedUser();
  const supabase = await createClient();

  const result = await snoozeReminderForUser(user?.id ?? null, reminderId, snoozedUntil, async (userId, id, until) =>
    repo.updateReminderSnooze(supabase, userId, id, until)
  );

  if (!result.success) return { error: result.error };
  revalidateReminderPages();
  return {};
}

/** Manual "refresh" entry point — the Reminder Center and dashboard already resync on every render, so this exists for a client action (e.g. a "Refresh" button) that wants an explicit, awaited resync before re-reading. */
export async function synchronizeReminders(): Promise<ReminderActionResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in." };

  const supabase = await createClient();
  const result = await synchronizeRemindersForUser(supabase, user.id);
  if (result.error) return { error: "Couldn't refresh your reminders. Please try again." };

  revalidateReminderPages();
  return {};
}

/**
 * Dependency-free reminder mutation logic, separated from actions.ts (the
 * "use server" entry point) and repository.ts (the Supabase queries) —
 * same split as applications/plan.ts and applications/tasks.ts. Identity
 * always comes from an already-resolved session user id, never a
 * client-supplied one.
 */

import { REMINDER_TYPE_SOURCE } from "@/lib/reminders/constants";
import type { ReminderType } from "@/types/database";

export type ReminderResult = { success: true } | { success: false; error: string };
export type ReminderCreateResult = { success: true; reminderId: string } | { success: false; error: string };

const MAX_TITLE_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 2000;

export function validateReminderTitle(title: string): string | null {
  if (title.trim().length === 0) return "Give this reminder a title.";
  if (title.length > MAX_TITLE_LENGTH) return "Title is too long.";
  return null;
}

export function validateReminderMessage(message: string | null): string | null {
  if (message !== null && message.length > MAX_MESSAGE_LENGTH) return "Message is too long.";
  return null;
}

/** Custom reminders are always for something in the future — a reminder for a date that's already passed can never fire. Mirrors "do not generate reminders in the past" for the automatic side. */
export function validateRemindAt(remindAt: string, now: Date = new Date()): string | null {
  const parsed = new Date(remindAt);
  if (Number.isNaN(parsed.getTime())) return "That date doesn't look right.";
  if (parsed.getTime() <= now.getTime()) return "Pick a date and time in the future.";
  return null;
}

/** A snooze can only ever push a reminder later — never into the past, and never to "right now" (that isn't a snooze). */
export function validateSnoozeDate(snoozedUntil: string, now: Date = new Date()): string | null {
  const parsed = new Date(snoozedUntil);
  if (Number.isNaN(parsed.getTime())) return "That date doesn't look right.";
  if (parsed.getTime() <= now.getTime()) return "Snooze to a date in the future.";
  return null;
}

export type CreateCustomReminderInput = {
  title: string;
  message?: string | null;
  remindAt: string;
  opportunityId?: string | null;
  applicationPlanId?: string | null;
  applicationTaskId?: string | null;
  /** "custom" unless this is explicitly a follow-up reminder — both always carry source "student_created". */
  reminderType?: Extract<ReminderType, "custom" | "follow_up">;
};

export type CreateReminderFn = (
  userId: string,
  input: CreateCustomReminderInput & { source: "student_created" }
) => Promise<{ reminderId: string | null; error: string | null }>;

export async function createCustomReminderForUser(
  userId: string | null,
  input: CreateCustomReminderInput,
  create: CreateReminderFn,
  now: Date = new Date()
): Promise<ReminderCreateResult> {
  if (userId === null) {
    return { success: false, error: "You need to be signed in to set a reminder." };
  }

  const titleError = validateReminderTitle(input.title);
  if (titleError) return { success: false, error: titleError };

  const messageError = validateReminderMessage(input.message ?? null);
  if (messageError) return { success: false, error: messageError };

  const dateError = validateRemindAt(input.remindAt, now);
  if (dateError) return { success: false, error: dateError };

  const { reminderId, error } = await create(userId, { ...input, source: "student_created" });
  if (error || reminderId === null) {
    console.error("[reminders] failed to create custom reminder:", error);
    return { success: false, error: "Couldn't save that reminder. Please try again." };
  }

  return { success: true, reminderId };
}

export type ReminderMutationFn = (userId: string, reminderId: string) => Promise<{ error: string | null }>;

async function runOwnedMutation(
  userId: string | null,
  reminderId: string,
  mutate: ReminderMutationFn,
  signedOutMessage: string,
  failureMessage: string,
  logLabel: string
): Promise<ReminderResult> {
  if (userId === null) {
    return { success: false, error: signedOutMessage };
  }

  const { error } = await mutate(userId, reminderId);
  if (error) {
    console.error(`[reminders] ${logLabel}:`, error);
    return { success: false, error: failureMessage };
  }

  return { success: true };
}

export async function completeReminderForUser(
  userId: string | null,
  reminderId: string,
  complete: ReminderMutationFn
): Promise<ReminderResult> {
  return runOwnedMutation(
    userId,
    reminderId,
    complete,
    "You need to be signed in to update this reminder.",
    "Couldn't mark that as done. Please try again.",
    "failed to complete reminder"
  );
}

export async function reopenReminderForUser(
  userId: string | null,
  reminderId: string,
  reopen: ReminderMutationFn
): Promise<ReminderResult> {
  return runOwnedMutation(
    userId,
    reminderId,
    reopen,
    "You need to be signed in to update this reminder.",
    "Couldn't reopen that reminder. Please try again.",
    "failed to reopen reminder"
  );
}

export async function dismissReminderForUser(
  userId: string | null,
  reminderId: string,
  dismiss: ReminderMutationFn
): Promise<ReminderResult> {
  return runOwnedMutation(
    userId,
    reminderId,
    dismiss,
    "You need to be signed in to update this reminder.",
    "Couldn't dismiss that reminder. Please try again.",
    "failed to dismiss reminder"
  );
}

export type SnoozeReminderFn = (userId: string, reminderId: string, snoozedUntil: string) => Promise<{ error: string | null }>;

export async function snoozeReminderForUser(
  userId: string | null,
  reminderId: string,
  snoozedUntil: string,
  snooze: SnoozeReminderFn,
  now: Date = new Date()
): Promise<ReminderResult> {
  if (userId === null) {
    return { success: false, error: "You need to be signed in to snooze this reminder." };
  }

  const dateError = validateSnoozeDate(snoozedUntil, now);
  if (dateError) return { success: false, error: dateError };

  const { error } = await snooze(userId, reminderId, snoozedUntil);
  if (error) {
    console.error("[reminders] failed to snooze reminder:", error);
    return { success: false, error: "Couldn't snooze that reminder. Please try again." };
  }

  return { success: true };
}

/** Re-exported so callers building a create payload never have to hardcode the type/source mapping themselves. */
export { REMINDER_TYPE_SOURCE };

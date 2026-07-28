/**
 * Dependency-free reminder logic — no Supabase client, so urgency,
 * grouping, next-best-action, and automatic-timing math are all
 * unit-testable without a database. Same split as
 * applications/summary.ts + applications/tasks.ts's `isTaskOverdue`.
 */

export type UrgencyLevel = "overdue" | "today" | "this_week" | "later";

export type ReminderLike = {
  remind_at: string;
  completed_at: string | null;
  dismissed_at: string | null;
  snoozed_until: string | null;
};

const DAY_MS = 86_400_000;

function startOfDayUTC(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function isReminderActive(reminder: ReminderLike): boolean {
  return reminder.completed_at === null && reminder.dismissed_at === null;
}

/** True only while a snooze is still in effect — once `snoozed_until` itself passes, the reminder falls back to its original `remind_at` (see `effectiveReminderDate`) rather than staying hidden forever. */
export function isReminderSnoozed(reminder: ReminderLike, now: Date = new Date()): boolean {
  return reminder.snoozed_until !== null && new Date(reminder.snoozed_until).getTime() > now.getTime();
}

/** The date urgency/grouping actually key off — the live snooze date while snoozed, otherwise the reminder's own `remind_at`. Never mutates `remind_at` itself, so "the original deadline remains visible" (spec section 4) regardless of how many times a reminder is snoozed. */
export function effectiveReminderDate(reminder: ReminderLike, now: Date = new Date()): string {
  return isReminderSnoozed(reminder, now) ? (reminder.snoozed_until as string) : reminder.remind_at;
}

/** Calendar-day comparison in UTC (same convention as opportunities/format.ts) — a reminder due earlier today is never "overdue" just because a few hours have passed. */
export function computeUrgency(reminder: ReminderLike, now: Date = new Date()): UrgencyLevel {
  const targetDay = startOfDayUTC(new Date(effectiveReminderDate(reminder, now)));
  const today = startOfDayUTC(now);
  const daysUntil = Math.round((targetDay - today) / DAY_MS);

  if (daysUntil < 0) return "overdue";
  if (daysUntil === 0) return "today";
  if (daysUntil <= 7) return "this_week";
  return "later";
}

export function isReminderOverdue(reminder: ReminderLike, now: Date = new Date()): boolean {
  return isReminderActive(reminder) && computeUrgency(reminder, now) === "overdue";
}

export type ReminderGroups<T extends ReminderLike> = {
  overdue: T[];
  today: T[];
  thisWeek: T[];
  later: T[];
  done: T[];
};

/**
 * The Reminder Center's five sections (spec section 3). A completed or
 * dismissed reminder always lands in `done` regardless of its date; every
 * other reminder is grouped by its *effective* date, so a still-snoozed
 * reminder simply doesn't appear until its snooze date arrives (spec
 * section 4: "snoozed reminders leave the active list until the snooze
 * date") and reappears in whichever bucket that date now falls into.
 */
export function groupReminders<T extends ReminderLike>(
  reminders: readonly T[],
  now: Date = new Date()
): ReminderGroups<T> {
  const groups: ReminderGroups<T> = { overdue: [], today: [], thisWeek: [], later: [], done: [] };

  for (const reminder of reminders) {
    if (!isReminderActive(reminder)) {
      groups.done.push(reminder);
      continue;
    }
    const urgency = computeUrgency(reminder, now);
    if (urgency === "overdue") groups.overdue.push(reminder);
    else if (urgency === "today") groups.today.push(reminder);
    else if (urgency === "this_week") groups.thisWeek.push(reminder);
    else groups.later.push(reminder);
  }

  return groups;
}

/** Soonest-first, with any overdue reminder always outranking a not-yet-due one — the ordering "what should the student work on next" needs. */
export function compareReminderUrgency<T extends ReminderLike>(a: T, b: T, now: Date = new Date()): number {
  const aOverdue = isReminderActive(a) && computeUrgency(a, now) === "overdue";
  const bOverdue = isReminderActive(b) && computeUrgency(b, now) === "overdue";
  if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
  return new Date(effectiveReminderDate(a, now)).getTime() - new Date(effectiveReminderDate(b, now)).getTime();
}

/** The single reminder the student should act on next — the most urgent active (not completed/dismissed) reminder, overdue items always first. `null` when there's nothing left to do. */
export function selectNextBestAction<T extends ReminderLike>(
  reminders: readonly T[],
  now: Date = new Date()
): T | null {
  const active = reminders.filter(isReminderActive);
  if (active.length === 0) return null;
  return [...active].sort((a, b) => compareReminderUrgency(a, b, now))[0];
}

export type ReminderDashboardSummary<T> = {
  next: T | null;
  overdueCount: number;
  thisWeekCount: number;
};

/** The dashboard's deliberately small "Next up" card (spec section 5) — nearest urgent item, overdue count, due-this-week count, nothing more. `thisWeekCount` includes today, mirroring how "This week" reads on the Reminder Center itself. */
export function buildReminderDashboardSummary<T extends ReminderLike>(
  reminders: readonly T[],
  now: Date = new Date()
): ReminderDashboardSummary<T> {
  const groups = groupReminders(reminders, now);
  return {
    next: selectNextBestAction(reminders, now),
    overdueCount: groups.overdue.length,
    thisWeekCount: groups.today.length + groups.thisWeek.length,
  };
}

/** A snooze target `daysFromNow` in the future — the client passes `SNOOZE_PRESET_DAYS[preset]` (see reminders/constants.ts) as `daysFromNow`; kept here rather than importing the preset map so this module has no dependency beyond plain numbers. */
export function computeSnoozePresetDate(daysFromNow: number, now: Date = new Date()): string {
  return new Date(now.getTime() + daysFromNow * DAY_MS).toISOString();
}

export type AutomaticReminderOccurrence = { offsetDays: number; remindAt: string };

/**
 * Every future reminder occurrence for one target date at a given set of
 * "days before" offsets — the core of automatic reminder generation (spec
 * section 9). An offset whose resulting date has already passed is simply
 * dropped, never generated ("do not generate reminders in the past"): for
 * an opportunity whose deadline has already closed, every offset ends up
 * in the past, so this naturally returns an empty list rather than a fake
 * future reminder (spec section 2's "expired opportunities show warnings,
 * not fake future reminders" — the warning itself is a UI concern, see
 * applications/opportunity-status.ts's `isOpportunityClosedOrExpired`).
 */
export function computeAutomaticReminderOccurrences(
  targetDate: string,
  offsetsDays: readonly number[],
  now: Date = new Date()
): AutomaticReminderOccurrence[] {
  const target = new Date(targetDate).getTime();
  return offsetsDays
    .map((offsetDays) => ({ offsetDays, remindAtMs: target - offsetDays * DAY_MS }))
    .filter((occurrence) => occurrence.remindAtMs > now.getTime())
    .map((occurrence) => ({
      offsetDays: occurrence.offsetDays,
      remindAt: new Date(occurrence.remindAtMs).toISOString(),
    }));
}

import { describe, expect, it } from "vitest";

import {
  buildReminderDashboardSummary,
  computeAutomaticReminderOccurrences,
  computeSnoozePresetDate,
  computeUrgency,
  effectiveReminderDate,
  groupReminders,
  isReminderOverdue,
  isReminderSnoozed,
  selectNextBestAction,
  type ReminderLike,
} from "@/lib/reminders/intelligence";

const NOW = new Date("2026-07-27T12:00:00Z");

function reminder(overrides: Partial<ReminderLike> = {}): ReminderLike {
  return {
    remind_at: NOW.toISOString(),
    completed_at: null,
    dismissed_at: null,
    snoozed_until: null,
    ...overrides,
  };
}

describe("computeUrgency", () => {
  it("is overdue for a date before today, even by one calendar day", () => {
    expect(computeUrgency(reminder({ remind_at: "2026-07-26T23:00:00Z" }), NOW)).toBe("overdue");
  });

  it("is today for any time earlier today, never overdue from hours alone", () => {
    expect(computeUrgency(reminder({ remind_at: "2026-07-27T00:00:00Z" }), NOW)).toBe("today");
  });

  it("is this_week within the next 7 days", () => {
    expect(computeUrgency(reminder({ remind_at: "2026-08-01T00:00:00Z" }), NOW)).toBe("this_week");
  });

  it("is later beyond 7 days", () => {
    expect(computeUrgency(reminder({ remind_at: "2026-08-15T00:00:00Z" }), NOW)).toBe("later");
  });

  it("keys off the snooze date while a snooze is still in effect", () => {
    const snoozed = reminder({ remind_at: "2026-07-01T00:00:00Z", snoozed_until: "2026-08-15T00:00:00Z" });
    expect(computeUrgency(snoozed, NOW)).toBe("later");
  });

  it("falls back to the original remind_at once the snooze date itself has passed", () => {
    const expiredSnooze = reminder({ remind_at: "2026-07-01T00:00:00Z", snoozed_until: "2026-07-10T00:00:00Z" });
    expect(computeUrgency(expiredSnooze, NOW)).toBe("overdue");
    expect(effectiveReminderDate(expiredSnooze, NOW)).toBe("2026-07-01T00:00:00Z");
  });
});

describe("isReminderSnoozed / isReminderOverdue", () => {
  it("is snoozed only while snoozed_until is still in the future", () => {
    expect(isReminderSnoozed(reminder({ snoozed_until: "2026-08-01T00:00:00Z" }), NOW)).toBe(true);
    expect(isReminderSnoozed(reminder({ snoozed_until: "2026-07-01T00:00:00Z" }), NOW)).toBe(false);
  });

  it("never reports a completed or dismissed reminder as overdue", () => {
    const past = { remind_at: "2026-01-01T00:00:00Z" };
    expect(isReminderOverdue(reminder({ ...past, completed_at: NOW.toISOString() }), NOW)).toBe(false);
    expect(isReminderOverdue(reminder({ ...past, dismissed_at: NOW.toISOString() }), NOW)).toBe(false);
    expect(isReminderOverdue(reminder(past), NOW)).toBe(true);
  });
});

describe("groupReminders", () => {
  it("sorts a completed or dismissed reminder into done regardless of its date", () => {
    const done = reminder({ remind_at: "2026-01-01T00:00:00Z", completed_at: NOW.toISOString() });
    const groups = groupReminders([done], NOW);
    expect(groups.done).toEqual([done]);
    expect(groups.overdue).toEqual([]);
  });

  it("groups active reminders into overdue/today/this_week/later by effective date", () => {
    const overdue = reminder({ remind_at: "2026-07-01T00:00:00Z" });
    const today = reminder({ remind_at: "2026-07-27T08:00:00Z" });
    const thisWeek = reminder({ remind_at: "2026-07-30T00:00:00Z" });
    const later = reminder({ remind_at: "2026-09-01T00:00:00Z" });

    const groups = groupReminders([overdue, today, thisWeek, later], NOW);
    expect(groups.overdue).toEqual([overdue]);
    expect(groups.today).toEqual([today]);
    expect(groups.thisWeek).toEqual([thisWeek]);
    expect(groups.later).toEqual([later]);
  });

  it("keeps a still-snoozed reminder out of overdue even if its original date has passed", () => {
    const snoozed = reminder({ remind_at: "2026-07-01T00:00:00Z", snoozed_until: "2026-07-29T00:00:00Z" });
    const groups = groupReminders([snoozed], NOW);
    expect(groups.overdue).toEqual([]);
    expect(groups.thisWeek).toEqual([snoozed]);
  });
});

describe("selectNextBestAction", () => {
  it("returns null when nothing is active", () => {
    const done = reminder({ completed_at: NOW.toISOString() });
    expect(selectNextBestAction([done], NOW)).toBeNull();
  });

  it("always prefers an overdue reminder over a merely upcoming one", () => {
    const overdue = reminder({ remind_at: "2026-07-01T00:00:00Z" });
    const soonest = reminder({ remind_at: "2026-07-27T13:00:00Z" });
    expect(selectNextBestAction([soonest, overdue], NOW)).toBe(overdue);
  });

  it("otherwise picks the soonest upcoming reminder", () => {
    const soon = reminder({ remind_at: "2026-07-28T00:00:00Z" });
    const later = reminder({ remind_at: "2026-08-15T00:00:00Z" });
    expect(selectNextBestAction([later, soon], NOW)).toBe(soon);
  });
});

describe("buildReminderDashboardSummary", () => {
  it("reports the next item plus overdue and this-week counts, nothing more", () => {
    const overdueOne = reminder({ remind_at: "2026-07-01T00:00:00Z" });
    const overdueTwo = reminder({ remind_at: "2026-07-10T00:00:00Z" });
    const today = reminder({ remind_at: "2026-07-27T18:00:00Z" });
    const thisWeek = reminder({ remind_at: "2026-07-30T00:00:00Z" });
    const later = reminder({ remind_at: "2026-09-01T00:00:00Z" });

    const summary = buildReminderDashboardSummary([overdueOne, overdueTwo, today, thisWeek, later], NOW);
    expect(summary.overdueCount).toBe(2);
    expect(summary.thisWeekCount).toBe(2); // today + this_week
    expect(summary.next).toBe(overdueOne);
  });

  it("is entirely empty when there's nothing active", () => {
    const summary = buildReminderDashboardSummary([], NOW);
    expect(summary).toEqual({ next: null, overdueCount: 0, thisWeekCount: 0 });
  });
});

describe("computeAutomaticReminderOccurrences", () => {
  it("produces one occurrence per offset, each the right number of days before the target", () => {
    const occurrences = computeAutomaticReminderOccurrences("2026-08-15T00:00:00Z", [14, 3], NOW);
    expect(occurrences).toEqual([
      { offsetDays: 14, remindAt: "2026-08-01T00:00:00.000Z" },
      { offsetDays: 3, remindAt: "2026-08-12T00:00:00.000Z" },
    ]);
  });

  it("never generates an occurrence in the past", () => {
    // Target is only 2 days out — the 14-day and 3-day-before offsets are both already behind "now".
    const occurrences = computeAutomaticReminderOccurrences("2026-07-29T00:00:00Z", [14, 3], NOW);
    expect(occurrences).toEqual([]);
  });

  it("returns nothing at all for an already-passed deadline (expired opportunities get no fake future reminders)", () => {
    const occurrences = computeAutomaticReminderOccurrences("2026-01-01T00:00:00Z", [14, 3], NOW);
    expect(occurrences).toEqual([]);
  });
});

describe("computeSnoozePresetDate", () => {
  it("adds the given number of days to now", () => {
    expect(computeSnoozePresetDate(3, NOW)).toBe("2026-07-30T12:00:00.000Z");
  });
});

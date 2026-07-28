const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** Reminders carry a real instant (unlike task due_date's date-only column), so unlike opportunities/format.ts this deliberately renders in the viewer's own local time zone — "you'll see this at 3:00 PM" should mean their 3:00 PM. */
export function formatReminderDateTime(iso: string): string {
  return DATE_TIME_FORMATTER.format(new Date(iso));
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** A short "Aug 1" form for compact contexts (the dashboard's Next up card, snooze option previews). */
export function formatReminderShortDate(iso: string): string {
  return DATE_FORMATTER.format(new Date(iso));
}

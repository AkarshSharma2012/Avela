"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { BellOff, Check, ExternalLink, RotateCcw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UrgencyBadge } from "@/components/reminders/urgency-badge";
import { completeReminder, dismissReminder, reopenReminder, snoozeReminder, undismissReminder } from "@/lib/reminders/actions";
import { REMINDER_SOURCE_LABELS, SNOOZE_OPTIONS, SNOOZE_PRESET_DAYS, type SnoozePreset } from "@/lib/reminders/constants";
import { formatReminderDateTime } from "@/lib/reminders/format";
import {
  computeSnoozePresetDate,
  computeUrgency,
  effectiveReminderDate,
  isReminderSnoozed,
} from "@/lib/reminders/intelligence";
import type { StudentReminder } from "@/types/reminder";
import { cn } from "@/lib/utils";

export type ReminderCardData = StudentReminder & {
  relatedLabel?: string | null;
  relatedHref?: string | null;
};

/** One reminder — the Reminder Center's atomic unit, also reused (in a compact form) by the dashboard's Next up card and the Application workspace's reminder panel. Every action here is optimistic, reverting only if the Server Action reports an error, same pattern task-checklist.tsx/save-button.tsx already follow. */
function ReminderCard({ reminder, compact = false }: { reminder: ReminderCardData; compact?: boolean }) {
  const [completedAt, setCompletedAt] = useState(reminder.completed_at);
  const [dismissedAt, setDismissedAt] = useState(reminder.dismissed_at);
  const [snoozedUntil, setSnoozedUntil] = useState(reminder.snoozed_until);
  const [showSnoozeOptions, setShowSnoozeOptions] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [isPending, startTransition] = useTransition();

  const live = { ...reminder, completed_at: completedAt, dismissed_at: dismissedAt, snoozed_until: snoozedUntil };
  const done = completedAt !== null || dismissedAt !== null;
  const urgency = computeUrgency(live);
  const snoozed = isReminderSnoozed(live);
  const displayDate = effectiveReminderDate(live);

  function toggleComplete() {
    const next = completedAt === null;
    const nextValue = next ? new Date().toISOString() : null;
    setCompletedAt(nextValue);
    startTransition(async () => {
      const result = next ? await completeReminder(reminder.id) : await reopenReminder(reminder.id);
      if (result.error) {
        setCompletedAt(completedAt);
        setAnnouncement(result.error);
        return;
      }
      setAnnouncement(next ? "Marked as done." : "Reopened.");
    });
  }

  function toggleDismiss() {
    const next = dismissedAt === null;
    const nextValue = next ? new Date().toISOString() : null;
    setDismissedAt(nextValue);
    startTransition(async () => {
      const result = next ? await dismissReminder(reminder.id) : await undismissReminder(reminder.id);
      if (result.error) {
        setDismissedAt(dismissedAt);
        setAnnouncement(result.error);
        return;
      }
      setAnnouncement(next ? "Dismissed." : "Restored.");
    });
  }

  function applySnooze(until: string) {
    setError(null);
    setSnoozedUntil(until);
    setShowSnoozeOptions(false);
    startTransition(async () => {
      const result = await snoozeReminder(reminder.id, until);
      if (result.error) {
        setSnoozedUntil(reminder.snoozed_until);
        setError(result.error);
        return;
      }
      setAnnouncement(`Snoozed until ${formatReminderDateTime(until)}.`);
    });
  }

  function handlePreset(preset: SnoozePreset) {
    applySnooze(computeSnoozePresetDate(SNOOZE_PRESET_DAYS[preset]));
  }

  function handleCustomSnooze(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customDate) return;
    applySnooze(new Date(customDate).toISOString());
  }

  return (
    <li className={cn("flex flex-col gap-2.5 rounded-md border border-border bg-card px-4 py-3.5", done && "opacity-70")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cn("text-sm font-medium text-foreground", done && "line-through")}>{reminder.title}</p>
          {reminder.message && !compact && <p className="mt-0.5 text-xs text-muted-foreground">{reminder.message}</p>}
          {reminder.relatedLabel && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {reminder.relatedHref ? (
                <Link href={reminder.relatedHref} className="underline-offset-2 hover:underline">
                  {reminder.relatedLabel}
                </Link>
              ) : (
                reminder.relatedLabel
              )}
            </p>
          )}
        </div>
        {!done && <UrgencyBadge urgency={urgency} />}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{done ? (completedAt ? "Completed" : "Dismissed") : `Due ${formatReminderDateTime(displayDate)}`}</span>
        {snoozed && !done && (
          <span className="inline-flex items-center gap-1">
            <BellOff aria-hidden="true" className="size-3" />
            Snoozed — originally due {formatReminderDateTime(reminder.remind_at)}
          </span>
        )}
        <span>· {REMINDER_SOURCE_LABELS[reminder.source]}</span>
      </div>

      {!done && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button type="button" variant="secondary" size="xs" onClick={toggleComplete} disabled={isPending}>
            <Check aria-hidden="true" className="size-3" />
            Mark done
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setShowSnoozeOptions((v) => !v)}
            aria-expanded={showSnoozeOptions}
            disabled={isPending}
          >
            <BellOff aria-hidden="true" className="size-3" />
            Snooze
          </Button>
          <Button type="button" variant="ghost" size="xs" onClick={toggleDismiss} disabled={isPending}>
            <TriangleAlert aria-hidden="true" className="size-3" />
            Dismiss
          </Button>
          {reminder.relatedHref && (
            <Link
              href={reminder.relatedHref}
              className="inline-flex items-center gap-1 rounded-[10px] px-2 py-1 text-xs font-medium text-primary hover:underline"
            >
              Open
              <ExternalLink aria-hidden="true" className="size-3" />
            </Link>
          )}
        </div>
      )}

      {done && (
        <div>
          <Button type="button" variant="ghost" size="xs" onClick={completedAt ? toggleComplete : toggleDismiss} disabled={isPending}>
            <RotateCcw aria-hidden="true" className="size-3" />
            {completedAt ? "Reopen" : "Restore"}
          </Button>
        </div>
      )}

      {showSnoozeOptions && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-secondary px-3 py-2.5">
          <p className="text-xs font-medium text-foreground">Snooze until</p>
          <div className="flex flex-wrap gap-1.5">
            {SNOOZE_OPTIONS.filter((option) => option.value !== "custom").map((option) => (
              <Button
                key={option.value}
                type="button"
                variant="outline"
                size="xs"
                onClick={() => handlePreset(option.value as SnoozePreset)}
                disabled={isPending}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <form onSubmit={handleCustomSnooze} className="flex items-center gap-2">
            <Label htmlFor={`snooze-custom-${reminder.id}`} className="sr-only">
              Custom snooze date
            </Label>
            <Input
              id={`snooze-custom-${reminder.id}`}
              type="date"
              value={customDate}
              onChange={(event) => setCustomDate(event.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              disabled={isPending}
              className="h-7 w-fit px-2 py-1 text-xs"
            />
            <Button type="submit" variant="outline" size="xs" disabled={isPending || !customDate}>
              Set date
            </Button>
          </form>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </li>
  );
}

export { ReminderCard };

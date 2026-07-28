"use client";

import { useState, useTransition } from "react";
import { BellRing, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatReminderDateTime } from "@/lib/reminders/format";
import { remindMeOnDate, undoRecommendationFeedback } from "@/lib/opportunities/feedback-actions";
import { cn } from "@/lib/utils";

/**
 * The opportunity detail page's own "Remind me" (spec section 7) — unlike
 * the quick toggle on a recommendation card (recommendation-feedback-controls.tsx,
 * which defaults to one month before the deadline), this lets a student
 * pick the exact date. Both write the same `recommendation_feedback`
 * "remind_later" row (see feedback-actions.ts's `remindMeOnDate`), so
 * there's never a second, competing reminder record for the same
 * opportunity.
 */
function RemindMeButton({ opportunityId, initialReminderAt }: { opportunityId: string; initialReminderAt: string | null }) {
  const [reminderAt, setReminderAt] = useState(initialReminderAt);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [isPending, startTransition] = useTransition();

  function save() {
    if (!date) return;
    const iso = new Date(date).toISOString();
    startTransition(async () => {
      const result = await remindMeOnDate(opportunityId, iso);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setReminderAt(iso);
      setOpen(false);
      setAnnouncement("We'll remind you on that date.");
    });
  }

  function cancelReminder() {
    startTransition(async () => {
      const result = await undoRecommendationFeedback(opportunityId, "remind_later");
      if (result.error) {
        setAnnouncement(result.error);
        return;
      }
      setReminderAt(null);
      setAnnouncement("Reminder cancelled.");
    });
  }

  if (reminderAt && !open) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
          <BellRing aria-hidden="true" className="size-3.5" />
          Reminder set for {formatReminderDateTime(reminderAt)}
        </span>
        <Button type="button" variant="ghost" size="xs" onClick={() => setOpen(true)} disabled={isPending}>
          Change
        </Button>
        <Button type="button" variant="ghost" size="xs" onClick={cancelReminder} disabled={isPending}>
          <X aria-hidden="true" className="size-3" />
          Cancel
        </Button>
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)} className="gap-1.5">
        <BellRing aria-hidden="true" className="size-3.5" />
        Remind me
      </Button>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-end gap-2 rounded-md border border-border bg-secondary px-3 py-2.5")}>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`remind-me-date-${opportunityId}`} className="text-xs">
          Remind me on
        </Label>
        <Input
          id={`remind-me-date-${opportunityId}`}
          type="datetime-local"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          min={new Date().toISOString().slice(0, 16)}
          disabled={isPending}
          className="h-8 w-fit px-2 py-1 text-xs"
        />
      </div>
      <Button type="button" size="sm" onClick={save} disabled={isPending || !date}>
        Set reminder
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={isPending}>
        Cancel
      </Button>
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

export { RemindMeButton };

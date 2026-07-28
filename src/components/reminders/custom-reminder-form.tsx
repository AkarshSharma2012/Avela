"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCustomReminder } from "@/lib/reminders/actions";

/** A short, teen-friendly way to add a reminder of your own — used on the Reminder Center (no target), the Application workspace (pre-filled with the plan), and reused wherever else a custom reminder makes sense. Collapsed by default so it never crowds the page it's embedded in. */
function CustomReminderForm({
  applicationPlanId,
  opportunityId,
  applicationTaskId,
  onCreated,
}: {
  applicationPlanId?: string;
  opportunityId?: string;
  applicationTaskId?: string;
  onCreated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !remindAt) return;

    startTransition(async () => {
      const result = await createCustomReminder({
        title,
        remindAt: new Date(remindAt).toISOString(),
        applicationPlanId,
        opportunityId,
        applicationTaskId,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setTitle("");
      setRemindAt("");
      setOpen(false);
      setAnnouncement("Reminder added.");
      router.refresh();
      onCreated?.();
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" className="size-3.5" />
        Add a reminder
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-md border border-border bg-secondary px-4 py-3.5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="custom-reminder-title">What should we remind you about?</Label>
        <Input
          id="custom-reminder-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Ask my counselor for a transcript"
          disabled={isPending}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="custom-reminder-date">When?</Label>
        <Input
          id="custom-reminder-date"
          type="datetime-local"
          value={remindAt}
          onChange={(event) => setRemindAt(event.target.value)}
          min={new Date().toISOString().slice(0, 16)}
          disabled={isPending}
          className="w-fit"
          required
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={isPending || !title.trim() || !remindAt}>
          Save reminder
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={isPending}>
          Cancel
        </Button>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </form>
  );
}

export { CustomReminderForm };

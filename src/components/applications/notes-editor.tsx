"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { updateApplicationPlan } from "@/lib/applications/actions";
import { cn } from "@/lib/utils";

function NotesEditor({ planId, initialNotes }: { planId: string; initialNotes: string | null }) {
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [savedNotes, setSavedNotes] = useState(initialNotes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [isPending, startTransition] = useTransition();

  const isDirty = notes !== savedNotes;

  function save() {
    startTransition(async () => {
      const result = await updateApplicationPlan(planId, { notes: notes.trim().length === 0 ? null : notes });
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setSavedNotes(notes);
      setAnnouncement("Notes saved.");
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="application-notes">Notes</Label>
      <textarea
        id="application-notes"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Anything you want to remember about this application — contacts, ideas, reminders to yourself."
        rows={5}
        className={cn(
          "flex w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground transition-all duration-[var(--duration-fast)]",
          "placeholder:text-muted-foreground",
          "hover:border-foreground/25",
          "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:shadow-sm",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
        )}
        aria-invalid={error !== null}
        disabled={isPending}
      />
      <div className="flex items-center gap-3">
        <Button type="button" size="sm" variant="outline" onClick={save} disabled={isPending || !isDirty}>
          Save notes
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

export { NotesEditor };

"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateApplicationPlan } from "@/lib/applications/actions";

/** The student's own target submit date — editable and independent of the read-only official deadline snapshot shown alongside it (see the workspace page). */
function TargetDateInput({ planId, initialDate }: { planId: string; initialDate: string | null }) {
  const [date, setDate] = useState(initialDate ?? "");
  const [savedDate, setSavedDate] = useState(initialDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [isPending, startTransition] = useTransition();

  const isDirty = date !== savedDate;

  function save() {
    startTransition(async () => {
      const result = await updateApplicationPlan(planId, { targetSubmitDate: date === "" ? null : date });
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setSavedDate(date);
      setAnnouncement("Target date saved.");
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="target-submit-date">Your target submit date</Label>
      <div className="flex items-center gap-2">
        <Input
          id="target-submit-date"
          type="date"
          value={date}
          onChange={(event) => {
            setDate(event.target.value);
            setError(null);
          }}
          disabled={isPending}
          aria-invalid={error !== null}
          className="w-fit"
        />
        <Button type="button" size="sm" variant="outline" onClick={save} disabled={isPending || !isDirty}>
          Save
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

export { TargetDateInput };

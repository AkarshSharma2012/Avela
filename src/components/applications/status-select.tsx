"use client";

import { useState, useTransition } from "react";

import { Label } from "@/components/ui/label";
import { APPLICATION_STATUSES } from "@/lib/applications/constants";
import { updateApplicationPlan } from "@/lib/applications/actions";
import type { ApplicationPlanStatus } from "@/types/database";

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-card px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50";

function StatusSelect({ planId, initialStatus }: { planId: string; initialStatus: ApplicationPlanStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as ApplicationPlanStatus;
    const previous = status;
    setStatus(next);
    setError(null);
    startTransition(async () => {
      const result = await updateApplicationPlan(planId, { status: next });
      if (result.error) {
        setStatus(previous);
        setError(result.error);
        return;
      }
      setAnnouncement("Status updated.");
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="application-status">Status</Label>
      <select
        id="application-status"
        className={SELECT_CLASS}
        value={status}
        onChange={handleChange}
        disabled={isPending}
        aria-invalid={error !== null}
      >
        {APPLICATION_STATUSES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

export { StatusSelect };

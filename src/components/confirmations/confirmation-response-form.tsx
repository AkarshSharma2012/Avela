"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { submitConfirmationResponseAction } from "@/lib/confirmations/actions";
import type { ConfirmationResponseStatus } from "@/types/portfolio";

const TEXTAREA_CLASS =
  "flex w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground transition-all duration-[var(--duration-fast)] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30";

const OPTIONS: { status: ConfirmationResponseStatus; label: string }[] = [
  { status: "can_confirm", label: "I can confirm this" },
  { status: "can_confirm_participation_only", label: "I can confirm participation, but not every detail" },
  { status: "mostly_accurate", label: "This is mostly accurate" },
  { status: "cannot_verify", label: "I cannot verify this" },
];

/** Designed for under 20 seconds (spec Part 10): one tap, an optional note, done. No account, no marketing wall, no pressure to join Avela. */
function ConfirmationResponseForm({ token }: { token: string }) {
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRespond(status: ConfirmationResponseStatus) {
    startTransition(async () => {
      const result = await submitConfirmationResponseAction(token, status, note);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSubmitted(true);
    });
  }

  if (submitted) {
    return <p className="rounded-md border border-border bg-secondary px-4 py-3 text-sm text-foreground">Thanks — your response has been recorded.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {OPTIONS.map((option) => (
          <Button key={option.status} type="button" variant="outline" onClick={() => handleRespond(option.status)} disabled={isPending} className="justify-start">
            {option.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmation-note">Optional note</Label>
        <textarea
          id="confirmation-note"
          className={TEXTAREA_CLASS}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={isPending}
          placeholder="Anything you'd like to add — optional."
        />
      </div>

      <FieldError errors={error ? [error] : undefined} />
    </div>
  );
}

export { ConfirmationResponseForm };

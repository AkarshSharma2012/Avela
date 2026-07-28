"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";
import { reviewerDecide } from "@/lib/verification/actions";

const TEXTAREA_CLASS =
  "flex w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground transition-all duration-[var(--duration-fast)] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50";

/** Reviewer decisions are logged as immutable audit events server-side (see actions.ts's reviewerDecide) — this form only ever collects the two allowed outcomes and a respectful, specific note. */
function ReviewerDecisionForm({ verificationId }: { verificationId: string }) {
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function decide(decision: "confirm" | "reject") {
    startTransition(async () => {
      const result = await reviewerDecide(verificationId, decision, notes);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`review-notes-${verificationId}`}>Notes shown to the student</Label>
      <textarea
        id={`review-notes-${verificationId}`}
        className={TEXTAREA_CLASS}
        rows={2}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        disabled={isPending}
        placeholder="Describe what's missing or mismatched, specifically and respectfully."
      />
      <FieldError errors={error ? [error] : undefined} />
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={() => decide("confirm")} disabled={isPending}>
          Confirm
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => decide("reject")} disabled={isPending}>
          Evidence doesn&apos;t support this
        </Button>
      </div>
    </div>
  );
}

export { ReviewerDecisionForm };

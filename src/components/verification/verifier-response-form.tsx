"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";
import { confirmVerifierClaim, declineVerifierClaim, requestCorrectionFromVerifier } from "@/lib/verification/actions";

const TEXTAREA_CLASS =
  "flex w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground transition-all duration-[var(--duration-fast)] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50";

type Mode = "idle" | "correcting" | "done";

/** The entire verifier-facing surface for a single claim — confirm, decline, or ask for a correction. No session, no navigation elsewhere; this is the whole page. */
function VerifierResponseForm({ token }: { token: string }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [doneMessage, setDoneMessage] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (mode === "done") {
    return <p className="rounded-md border border-border bg-secondary px-4 py-3 text-sm text-foreground">{doneMessage}</p>;
  }

  function handleConfirm() {
    startTransition(async () => {
      const result = await confirmVerifierClaim(token);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDoneMessage("Thanks — your confirmation has been recorded.");
      setMode("done");
    });
  }

  function handleDecline() {
    startTransition(async () => {
      const result = await declineVerifierClaim(token);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDoneMessage("Thanks for letting us know — this has been flagged for a closer look.");
      setMode("done");
    });
  }

  function handleSubmitCorrection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await requestCorrectionFromVerifier(token, note);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDoneMessage("Thanks — your note has been sent back to the student.");
      setMode("done");
    });
  }

  if (mode === "correcting") {
    return (
      <form onSubmit={handleSubmitCorrection} className="flex flex-col gap-3">
        <Label htmlFor="correction-note">What should be corrected?</Label>
        <textarea
          id="correction-note"
          className={TEXTAREA_CLASS}
          rows={4}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={isPending}
          placeholder="Let the student know what doesn't match, in your own words."
        />
        <FieldError errors={error ? [error] : undefined} />
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={isPending || note.trim().length === 0}>
            {isPending ? "Sending…" : "Send note"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setMode("idle")} disabled={isPending}>
            Back
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleConfirm} disabled={isPending}>
          Yes, this is accurate
        </Button>
        <Button type="button" variant="outline" onClick={() => setMode("correcting")} disabled={isPending}>
          Something needs fixing
        </Button>
        <Button type="button" variant="ghost" onClick={handleDecline} disabled={isPending}>
          I can&apos;t confirm this
        </Button>
      </div>
      <FieldError errors={error ? [error] : undefined} />
    </div>
  );
}

export { VerifierResponseForm };

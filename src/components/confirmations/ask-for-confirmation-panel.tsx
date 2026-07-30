"use client";

import { useState, useTransition } from "react";
import { Check, CheckCircle2, Copy, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { cn } from "@/lib/utils";
import { CLAIM_DIMENSION_LABELS } from "@/lib/claims/constants";
import { createConfirmationRequestAction } from "@/lib/confirmations/actions";
import type { ClaimDimension } from "@/types/claims";
import type { ConfirmationReviewerRole } from "@/types/portfolio";

const REVIEWER_ROLES: { value: ConfirmationReviewerRole; label: string }[] = [
  { value: "teacher", label: "Teacher" },
  { value: "counselor", label: "Counselor" },
  { value: "coach", label: "Coach" },
  { value: "employer", label: "Employer" },
  { value: "mentor", label: "Mentor" },
  { value: "organization_leader", label: "Organization leader" },
  { value: "teammate", label: "Teammate" },
  { value: "community_member", label: "Community member" },
  { value: "parent_or_guardian", label: "Parent or guardian" },
];

function confirmUrl(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/confirm/${token}`;
}

/** Frictionless external confirmation (spec Part 10): the student picks a role and exactly which dimensions to ask about — never "confirm this whole item." Styled as chip toggles + a card, matching the rest of the guided-flow/Signal visual language rather than a bare admin form. */
function AskForConfirmationPanel({ itemId, availableDimensions }: { itemId: string; availableDimensions: ClaimDimension[] }) {
  const [role, setRole] = useState<ConfirmationReviewerRole>("teacher");
  const [selected, setSelected] = useState<Set<ClaimDimension>>(new Set());
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  function toggle(dimension: ClaimDimension) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(dimension)) next.delete(dimension);
      else next.add(dimension);
      return next;
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createConfirmationRequestAction({
        portfolioItemId: itemId,
        claimDimensions: Array.from(selected),
        reviewerRole: role,
        reviewerEmail: null,
        reviewerDisplayName: null,
        studentContextNote: note || null,
      });
      if (result.error || !result.token) {
        setError(result.error ?? "Couldn't create that request.");
        return;
      }
      setCreatedUrl(confirmUrl(result.token));
      setSelected(new Set());
      setNote("");
    });
  }

  if (createdUrl) {
    return (
      <div className="animate-fade-up rounded-lg border border-primary/30 bg-primary/5 px-4 py-4">
        <div className="flex items-start gap-2.5">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Send this link — it won&apos;t be shown again.</p>
            <p className="mt-0.5 text-xs text-muted-foreground">They&apos;ll see only what you asked about, and it takes them under 20 seconds.</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Input readOnly value={createdUrl} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
          <Button type="button" variant="outline" size="icon" onClick={() => navigator.clipboard.writeText(createdUrl)} aria-label="Copy link">
            <Copy aria-hidden="true" className="size-4" />
          </Button>
        </div>
        <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={() => setCreatedUrl(null)}>
          Ask someone else
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmation-role">Who are you asking?</Label>
        <select
          id="confirmation-role"
          value={role}
          onChange={(e) => setRole(e.target.value as ConfirmationReviewerRole)}
          className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground transition-all duration-[var(--duration-fast)] focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          {REVIEWER_ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium text-foreground">What should they confirm?</p>
        <p className="text-xs text-muted-foreground">Select one or more — they&apos;ll see only these, never the rest of your portfolio.</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {availableDimensions.map((dimension) => {
            const isSelected = selected.has(dimension);
            return (
              <button
                key={dimension}
                type="button"
                onClick={() => toggle(dimension)}
                aria-pressed={isSelected}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-[var(--duration-fast)]",
                  "hover:-translate-y-px focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                  isSelected
                    ? "border-primary bg-primary/10 text-primary shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
              >
                {isSelected && <Check aria-hidden="true" className="size-3" />}
                {CLAIM_DIMENSION_LABELS[dimension]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmation-context">Note for them (optional)</Label>
        <Input id="confirmation-context" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Hi Coach, could you confirm I was on the team?" />
      </div>

      <FieldError errors={error ? [error] : undefined} />

      <Button type="submit" disabled={isPending || selected.size === 0} className="w-fit">
        <Send aria-hidden="true" className="size-4" />
        {isPending ? "Creating…" : "Get a link to send"}
      </Button>
    </form>
  );
}

export { AskForConfirmationPanel };

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";
import { AUTHORITY_LEVEL_LABELS, OSINT_SUPPORT_LEVELS, SOURCE_TYPE_LABELS } from "@/lib/osint/constants";
import { getOsintCheckForReviewer, osintReviewerDecide } from "@/lib/osint/actions";
import type { PortfolioOsintReviewAction, PortfolioOsintSupportLevel } from "@/types/osint";

const TEXTAREA_CLASS =
  "flex w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground transition-all duration-[var(--duration-fast)] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Reviewer inspection + decision for one OSINT check (spec section 10):
 * normalized evidence with links to the original source, conflicts, and
 * every decision available to the reviewer — each one is written server-
 * side as an immutable audit row (see actions.ts's osintReviewerDecide).
 */
function OsintReviewerDecisionForm({ checkId }: { checkId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState<Awaited<ReturnType<typeof getOsintCheckForReviewer>>["data"] | null>(null);
  const [reason, setReason] = useState("");
  const [overrideLevel, setOverrideLevel] = useState<PortfolioOsintSupportLevel>("partially_supported");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function loadDetails() {
    setExpanded(true);
    if (details) return;
    startTransition(async () => {
      const result = await getOsintCheckForReviewer(checkId);
      if (result.error || !result.data) {
        setError(result.error ?? "Couldn't load this check.");
        return;
      }
      setDetails(result.data);
    });
  }

  function decide(action: PortfolioOsintReviewAction) {
    startTransition(async () => {
      const result = await osintReviewerDecide(checkId, action, reason, action === "override_support_level" ? overrideLevel : undefined);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      router.refresh();
    });
  }

  if (!expanded) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={loadDetails}>
        Inspect
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {details && (
        <>
          {details.evidence.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {details.evidence.map((evidence) => (
                <li key={evidence.id} className="rounded-md border border-border bg-secondary px-3 py-2 text-xs">
                  <span className="font-medium text-foreground">{SOURCE_TYPE_LABELS[evidence.source_type]}</span>
                  {" · "}
                  {AUTHORITY_LEVEL_LABELS[evidence.authority_level]}
                  {" · "}
                  <a href={evidence.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                    Open source <ExternalLink aria-hidden="true" className="size-3" />
                  </a>
                </li>
              ))}
            </ul>
          )}
          {details.conflicts.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {details.conflicts.map((conflict) => (
                <li key={conflict.id} className="rounded-md border border-dashed border-gold/40 bg-gold/10 px-3 py-2 text-xs text-foreground">
                  {conflict.respectful_message}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Label htmlFor={`osint-review-reason-${checkId}`}>Reason (shown in the audit log)</Label>
      <textarea
        id={`osint-review-reason-${checkId}`}
        className={TEXTAREA_CLASS}
        rows={2}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        disabled={isPending}
        placeholder="Describe your decision specifically and respectfully."
      />
      <FieldError errors={error ? [error] : undefined} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => decide("confirm_support")} disabled={isPending}>
          Confirm support
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => decide("request_clarification")} disabled={isPending}>
          Request clarification
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => decide("mark_insufficient")} disabled={isPending}>
          Mark insufficient
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <select
          className={SELECT_CLASS}
          value={overrideLevel}
          onChange={(event) => setOverrideLevel(event.target.value as PortfolioOsintSupportLevel)}
          disabled={isPending}
        >
          {OSINT_SUPPORT_LEVELS.map((level) => (
            <option key={level.value} value={level.value}>
              {level.label}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" size="sm" onClick={() => decide("override_support_level")} disabled={isPending}>
          Override to this level
        </Button>
      </div>
    </div>
  );
}

export { OsintReviewerDecisionForm };

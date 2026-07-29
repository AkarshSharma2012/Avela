import { CheckCircle2, Circle, HelpCircle, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ClaimSupportSummary } from "@/lib/claims/rollup";

function RowIcon({ status }: { status: ClaimSupportSummary["rows"][number]["status"] }) {
  if (status === "not_checked" || status === "unable_to_verify") {
    return <Circle aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />;
  }
  if (status === "needs_review") {
    return <HelpCircle aria-hidden="true" className="size-3.5 shrink-0 text-gold-foreground" />;
  }
  return <CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0 text-success" />;
}

/** Prefer checked rows over not-checked ones so the compact card reads like the spec's example (a short list of what's actually been done), capped small so this stays a glance, not a report. */
function pickHighlightRows(summary: ClaimSupportSummary): ClaimSupportSummary["rows"] {
  const checked = summary.rows.filter((row) => row.status !== "not_checked");
  const rest = summary.rows.filter((row) => row.status === "not_checked");
  return [...checked, ...rest].slice(0, 3);
}

/**
 * The spec's STATUS SUMMARY — the only verification content shown on the
 * normal item page by default. Everything else (the wizard, the technical
 * breakdown) opens from the two buttons here.
 */
function VerificationStatusCard({
  summary,
  hasAnySupport,
  onImprove,
  onSeeDetails,
}: {
  summary: ClaimSupportSummary;
  hasAnySupport: boolean;
  onImprove: () => void;
  onSeeDetails: () => void;
}) {
  const rows = pickHighlightRows(summary);

  return (
    <div className="animate-fade-up flex flex-col gap-3 rounded-xl border border-border bg-gradient-to-br from-primary/6 via-card to-card px-5 py-4">
      <div className="flex items-center gap-2">
        <Sparkles aria-hidden="true" className="size-4 text-gold-foreground" />
        <p className="text-sm font-semibold text-foreground">Support level: {summary.headline}</p>
      </div>

      {rows.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li key={row.dimension} className="flex items-center gap-2 text-sm">
              <RowIcon status={row.status} />
              <span className={cn(row.status === "not_checked" ? "text-muted-foreground" : "text-foreground")}>{row.label}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button type="button" size="sm" onClick={onImprove}>
          {hasAnySupport ? "Improve support" : "Support this entry"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onSeeDetails}>
          See details
        </Button>
      </div>
    </div>
  );
}

export { VerificationStatusCard };

import { CheckCircle2, Circle, HelpCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ClaimSupportSummary } from "@/lib/claims/rollup";

function RowIcon({ status }: { status: ClaimSupportSummary["rows"][number]["status"] }) {
  if (status === "not_checked" || status === "unable_to_verify") {
    return <Circle aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />;
  }
  if (status === "needs_review") {
    return <HelpCircle aria-hidden="true" className="size-4 shrink-0 text-gold-foreground" />;
  }
  return <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-success" />;
}

/** Step 4 — the spec's "Support level: Strong / ✓ Project found / ✓ Account connected / ○ Impact not checked" shape, straight from the same rollup the compact status card reads. */
function ResultStep({
  summary,
  onDone,
  onAddMore,
  onSeeDetails,
}: {
  summary: ClaimSupportSummary;
  onDone: () => void;
  onAddMore: () => void;
  onSeeDetails: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p role="status" aria-live="polite" className="text-lg font-semibold text-foreground">
        Support level: {summary.headline}
      </p>

      <ul className="flex flex-col gap-2">
        {summary.rows.map((row) => (
          <li key={row.dimension} className="flex items-center gap-2 text-sm">
            <RowIcon status={row.status} />
            <span className={cn(row.status === "not_checked" ? "text-muted-foreground" : "text-foreground")}>{row.label}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button type="button" size="sm" onClick={onDone}>
          Done
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onAddMore}>
          Add more support
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onSeeDetails}>
          See details
        </Button>
      </div>
    </div>
  );
}

export { ResultStep };

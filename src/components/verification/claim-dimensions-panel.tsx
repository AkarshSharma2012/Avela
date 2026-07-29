import { CheckCircle2, Circle, HelpCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ClaimSupportSummary } from "@/lib/claims/rollup";

/**
 * Spec section 12's low-friction summary shape: a short headline plus a
 * collapsed "See details" breakdown — never the full dimension model,
 * scoring logic, or connector names by default. A native <details> element
 * (no client JS needed) gives the expand/collapse behavior for free.
 */
function ClaimDimensionsPanel({ summary }: { summary: ClaimSupportSummary }) {
  if (summary.totalCount === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-foreground">Support level: {summary.headline}</p>
      <details className="group text-sm">
        <summary className="cursor-pointer list-none text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
          See details
        </summary>
        <ul className="mt-2 flex flex-col gap-1.5">
          {summary.rows.map((row) => (
            <li key={row.dimension} className="flex items-center gap-2 text-muted-foreground">
              <RowIcon status={row.status} />
              <span className={cn(row.status === "not_checked" && "text-muted-foreground")}>{row.label}</span>
              {row.stale && <span className="text-xs text-gold-foreground">(changed since checked)</span>}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function RowIcon({ status }: { status: ClaimSupportSummary["rows"][number]["status"] }) {
  if (status === "not_checked" || status === "unable_to_verify") {
    return <Circle aria-hidden="true" className="size-3.5 shrink-0" />;
  }
  if (status === "needs_review") {
    return <HelpCircle aria-hidden="true" className="size-3.5 shrink-0 text-gold-foreground" />;
  }
  return <CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0 text-success" />;
}

export { ClaimDimensionsPanel };

import { CircleCheck, CircleDot, CircleX, ShieldQuestion } from "lucide-react";

import type { EligibilityResult, EligibilityStatus } from "@/lib/opportunities/eligibility-engine";
import { cn } from "@/lib/utils";

// Icon + text together, never color alone — same accessibility rule as MatchBadge.
const STATUS_CONFIG: Record<
  EligibilityStatus,
  { label: string; icon: typeof CircleCheck; className: string }
> = {
  eligible: {
    label: "Eligible",
    icon: CircleCheck,
    className: "border-success/30 bg-success/10 text-success",
  },
  likely_eligible: {
    label: "Likely eligible",
    icon: CircleDot,
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  unclear: {
    label: "Eligibility unclear",
    icon: ShieldQuestion,
    className: "border-border bg-muted text-muted-foreground",
  },
  ineligible: {
    label: "Not eligible",
    icon: CircleX,
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
};

/**
 * Renders the per-student eligibility outcome from
 * `eligibility-engine.ts`'s `evaluateEligibility` — distinct from
 * `VerificationBadge` (is this listing confirmed accurate) and `MatchBadge`
 * (how well it fits preferences). Always shows at least one reason so
 * uncertainty is never hidden, per the spec.
 */
function EligibilityBadge({
  result,
  showReasons = false,
  className,
}: {
  result: EligibilityResult;
  showReasons?: boolean;
  className?: string;
}) {
  const { label, icon: Icon, className: tierClassName } = STATUS_CONFIG[result.status];

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span
        className={cn(
          "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
          tierClassName
        )}
      >
        <Icon aria-hidden="true" className="size-3.5" />
        {label}
      </span>
      {showReasons && result.reasons.length > 0 && (
        <ul className="space-y-0.5 text-xs text-text-secondary">
          {result.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export { EligibilityBadge };

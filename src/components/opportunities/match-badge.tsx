import { CircleCheck, CircleDot, CircleMinus } from "lucide-react";

import type { MatchResult, MatchTier } from "@/lib/opportunities/matching";
import { cn } from "@/lib/utils";

// Icon + text together, never color alone, so the tier reads correctly for
// colorblind users and in high-contrast/forced-color modes.
const TIER_CONFIG: Record<
  MatchTier,
  { label: string; icon: typeof CircleCheck; className: string }
> = {
  strong_fit: {
    label: "Strong fit",
    icon: CircleCheck,
    className: "border-success/30 bg-success/10 text-success",
  },
  possible_fit: {
    label: "Possible fit",
    icon: CircleDot,
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  limited_fit: {
    label: "Limited fit",
    icon: CircleMinus,
    className: "border-muted-foreground/30 bg-muted text-muted-foreground",
  },
};

function MatchBadge({
  result,
  showReasons = false,
  className,
}: {
  result: MatchResult;
  showReasons?: boolean;
  className?: string;
}) {
  const { label, icon: Icon, className: tierClassName } = TIER_CONFIG[result.tier];

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

export { MatchBadge };

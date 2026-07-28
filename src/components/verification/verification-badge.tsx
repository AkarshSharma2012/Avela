import { BadgeCheck, CircleDashed, Clock, FileCheck, TriangleAlert } from "lucide-react";

import { VERIFICATION_LEVEL_LABELS } from "@/lib/verification/constants";
import { cn } from "@/lib/utils";
import type { PortfolioVerificationLevel } from "@/types/database";

const LEVEL_STYLES: Record<PortfolioVerificationLevel, string> = {
  unverified: "border-border bg-secondary text-muted-foreground",
  evidence_added: "border-primary/25 bg-primary/10 text-primary",
  externally_confirmed: "border-success/30 bg-success/10 text-success",
  needs_review: "border-gold/40 bg-gold/15 text-gold-foreground",
  rejected: "border-border bg-secondary text-muted-foreground",
};

const LEVEL_ICONS: Record<PortfolioVerificationLevel, typeof BadgeCheck> = {
  unverified: CircleDashed,
  evidence_added: FileCheck,
  externally_confirmed: BadgeCheck,
  needs_review: Clock,
  rejected: TriangleAlert,
};

/** Never a truth judgment, only a support level — see lib/verification/constants.ts's VERIFICATION_LEVELS for the definitions this mirrors. */
function VerificationBadge({ level, className }: { level: PortfolioVerificationLevel; className?: string }) {
  const Icon = LEVEL_ICONS[level];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        LEVEL_STYLES[level],
        className
      )}
    >
      <Icon aria-hidden="true" className="size-3" />
      {VERIFICATION_LEVEL_LABELS[level]}
    </span>
  );
}

export { VerificationBadge };

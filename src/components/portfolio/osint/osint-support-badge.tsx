import { BadgeCheck, CircleDashed, ShieldCheck, TriangleAlert } from "lucide-react";

import { OSINT_SUPPORT_LEVEL_LABELS } from "@/lib/osint/constants";
import { cn } from "@/lib/utils";
import type { PortfolioOsintSupportLevel } from "@/types/database";

const LEVEL_STYLES: Record<PortfolioOsintSupportLevel, string> = {
  confirmed_by_authoritative_source: "border-success/30 bg-success/10 text-success",
  strongly_supported: "border-primary/25 bg-primary/10 text-primary",
  partially_supported: "border-gold/40 bg-gold/15 text-gold-foreground",
  unable_to_verify: "border-border bg-secondary text-muted-foreground",
  needs_review: "border-gold/40 bg-gold/15 text-gold-foreground",
};

const LEVEL_ICONS: Record<PortfolioOsintSupportLevel, typeof BadgeCheck> = {
  confirmed_by_authoritative_source: BadgeCheck,
  strongly_supported: ShieldCheck,
  partially_supported: CircleDashed,
  unable_to_verify: CircleDashed,
  needs_review: TriangleAlert,
};

/** Never a truth judgment, only how strongly a claim is publicly supported — see lib/osint/constants.ts's OSINT_SUPPORT_LEVELS for the definitions this mirrors. */
function OsintSupportBadge({ level, className }: { level: PortfolioOsintSupportLevel; className?: string }) {
  const Icon = LEVEL_ICONS[level];
  return (
    <span className={cn("inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", LEVEL_STYLES[level], className)}>
      <Icon aria-hidden="true" className="size-3" />
      {OSINT_SUPPORT_LEVEL_LABELS[level]}
    </span>
  );
}

export { OsintSupportBadge };

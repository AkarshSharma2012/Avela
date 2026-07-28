import { TriangleAlert } from "lucide-react";

import { VerificationBadge } from "@/components/verification/verification-badge";
import type { PortfolioVerificationLevel } from "@/types/database";

/**
 * Application workspace's "warn, never block" surface (spec section 7) —
 * shown next to an attached evidence item whose support level is thin.
 * Never prevents attaching or keeping the evidence, only surfaces the
 * level so the student can decide whether to strengthen it.
 */
function EvidenceWarningBanner({ level }: { level: PortfolioVerificationLevel }) {
  if (level !== "unverified" && level !== "needs_review") return null;

  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <TriangleAlert aria-hidden="true" className="size-3 shrink-0" />
      <VerificationBadge level={level} className="py-0" />
      {level === "unverified" ? "— consider adding evidence before you submit." : "— evidence needs a closer look."}
    </p>
  );
}

export { EvidenceWarningBanner };

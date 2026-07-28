import { CircleX, ClipboardList, Compass, ListChecks, PartyPopper, PenLine, Send, Undo2 } from "lucide-react";

import { APPLICATION_STATUS_LABELS } from "@/lib/applications/constants";
import { cn } from "@/lib/utils";
import type { ApplicationPlanStatus } from "@/types/database";

// Icon + text together (never color alone), same accessibility rule
// match-badge.tsx follows.
const STATUS_CONFIG: Record<ApplicationPlanStatus, { icon: typeof Compass; className: string }> = {
  interested: { icon: Compass, className: "border-muted-foreground/30 bg-muted text-muted-foreground" },
  planning: { icon: ClipboardList, className: "border-primary/30 bg-primary/10 text-primary" },
  preparing: { icon: PenLine, className: "border-insight/25 bg-insight/10 text-insight" },
  ready_to_apply: { icon: ListChecks, className: "border-gold/40 bg-gold/15 text-gold-foreground" },
  applied: { icon: Send, className: "border-primary/30 bg-primary/10 text-primary" },
  accepted: { icon: PartyPopper, className: "border-success/30 bg-success/10 text-success" },
  rejected: { icon: CircleX, className: "border-destructive/30 bg-destructive/10 text-destructive" },
  withdrawn: { icon: Undo2, className: "border-muted-foreground/30 bg-muted text-muted-foreground" },
};

function ApplicationStatusBadge({ status, className }: { status: ApplicationPlanStatus; className?: string }) {
  const { icon: Icon, className: statusClassName } = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        statusClassName,
        className
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {APPLICATION_STATUS_LABELS[status]}
    </span>
  );
}

export { ApplicationStatusBadge };

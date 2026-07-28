import { AlarmClockCheck, CalendarClock, CalendarDays, TriangleAlert } from "lucide-react";

import type { UrgencyLevel } from "@/lib/reminders/intelligence";
import { cn } from "@/lib/utils";

// Icon + text together (never color alone) — same accessibility rule
// application-status-badge.tsx follows (spec section 10: "visible urgency
// without relying only on color").
const URGENCY_CONFIG: Record<UrgencyLevel, { icon: typeof TriangleAlert; label: string; className: string }> = {
  overdue: { icon: TriangleAlert, label: "Overdue", className: "border-destructive/30 bg-destructive/10 text-destructive" },
  today: { icon: AlarmClockCheck, label: "Due today", className: "border-gold/40 bg-gold/15 text-gold-foreground" },
  this_week: { icon: CalendarClock, label: "This week", className: "border-primary/30 bg-primary/10 text-primary" },
  later: { icon: CalendarDays, label: "Later", className: "border-muted-foreground/30 bg-muted text-muted-foreground" },
};

function UrgencyBadge({ urgency, className }: { urgency: UrgencyLevel; className?: string }) {
  const { icon: Icon, label, className: urgencyClassName } = URGENCY_CONFIG[urgency];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        urgencyClassName,
        className
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
    </span>
  );
}

export { UrgencyBadge };

import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { formatShortDate } from "@/lib/opportunities/format";

type WeekSnapshot = {
  activeCount: number;
  nearestDeadline: { planId: string; opportunityTitle: string; date: string } | null;
};

/**
 * The sidebar's one compact, real-data middle-zone element (spec section
 * 1) — a single glanceable signal, not a second dashboard. Reuses the same
 * application summary the dashboard page computes (see AppLayout /
 * getCachedApplicationPlans), so this never fabricates or duplicates data.
 */
function SidebarWeekSnapshot({ snapshot }: { snapshot: WeekSnapshot }) {
  const { activeCount, nearestDeadline } = snapshot;

  return (
    <Link
      href={nearestDeadline ? `/applications/${nearestDeadline.planId}` : "/opportunities"}
      className="block rounded-lg border border-sidebar-border/60 bg-sidebar-accent/40 px-3 py-3 transition-colors hover:bg-sidebar-accent/70 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/50"
    >
      <p className="text-[0.65rem] font-semibold tracking-wide text-sidebar-foreground/55 uppercase">Your week</p>

      {nearestDeadline ? (
        <div className="mt-1.5 flex items-start gap-2">
          <CalendarClock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-sidebar-foreground/70" />
          <p className="text-xs leading-snug text-sidebar-foreground/85">
            {activeCount} active {activeCount === 1 ? "application" : "applications"}
            <br />
            Next: {nearestDeadline.opportunityTitle} · {formatShortDate(nearestDeadline.date)}
          </p>
        </div>
      ) : activeCount > 0 ? (
        <p className="mt-1.5 text-xs leading-snug text-sidebar-foreground/85">
          {activeCount} active {activeCount === 1 ? "application" : "applications"}, no deadline set yet.
        </p>
      ) : (
        <p className="mt-1.5 text-xs leading-snug text-sidebar-foreground/70">
          No active applications yet — explore opportunities to get started.
        </p>
      )}
    </Link>
  );
}

export { SidebarWeekSnapshot };
export type { WeekSnapshot };

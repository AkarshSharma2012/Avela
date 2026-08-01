import { Bookmark, CalendarClock, Sparkles } from "lucide-react";

import { MetricTile } from "@/components/dashboard/metric-tile";
import { ProgressOverviewPanel } from "@/components/dashboard/progress-overview-panel";

/**
 * The dashboard's "state of things" composition (spec section 2) — one
 * combined progress panel (profile readiness + application momentum, read
 * as related signals) beside three comparably-weighted metric tiles, all
 * top-aligned so neither side stretches to fill the other's height.
 */
function DashboardOverview({
  profileStrengthPercent,
  applicationMomentumPercent,
  activeApplicationCount,
  completedTaskCount,
  totalTaskCount,
  strongMatchCount,
  savedCount,
  upcomingDeadlineCount,
}: {
  profileStrengthPercent: number;
  applicationMomentumPercent: number;
  activeApplicationCount: number;
  completedTaskCount: number;
  totalTaskCount: number;
  strongMatchCount: number;
  savedCount: number;
  upcomingDeadlineCount: number;
}) {
  const momentumSublabel =
    activeApplicationCount === 0
      ? "No active applications yet"
      : `${activeApplicationCount} active · ${completedTaskCount}/${totalTaskCount} tasks done`;

  return (
    <section aria-labelledby="overview-heading" className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
      <h2 id="overview-heading" className="sr-only">
        Progress overview
      </h2>

      <div className="lg:col-span-5">
        <ProgressOverviewPanel
          rows={[
            {
              key: "profile",
              percent: profileStrengthPercent,
              label: "Profile readiness",
              sublabel: "Documentation completeness — not verification",
              tone: "primary",
            },
            {
              key: "momentum",
              percent: applicationMomentumPercent,
              label: "Application momentum",
              sublabel: momentumSublabel,
              tone: "success",
            },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:col-span-7">
        <MetricTile
          label="Strong matches"
          value={strongMatchCount}
          icon={Sparkles}
          tone="success"
          href="/opportunities"
          emptyTitle="No strong matches yet"
          emptyBody="Your next search can change this."
          emptyActionLabel="Find opportunities"
        />
        <MetricTile
          label="Saved"
          value={savedCount}
          icon={Bookmark}
          tone="gold"
          href="/saved"
          emptyTitle="Nothing saved yet"
          emptyBody="Save opportunities to compare later."
        />
        <MetricTile
          label="Deadlines"
          value={upcomingDeadlineCount}
          icon={CalendarClock}
          tone="coral"
          secondary="next 14 days"
          href="/applications"
          emptyTitle="No deadlines soon"
          emptyBody="You're clear for the next 14 days."
        />
      </div>
    </section>
  );
}

export { DashboardOverview };

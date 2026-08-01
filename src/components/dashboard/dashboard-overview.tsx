import { Bookmark, CalendarClock, Sparkles } from "lucide-react";

import { MetricTile } from "@/components/dashboard/metric-tile";
import { ProgressGauge } from "@/components/dashboard/progress-gauge";

/**
 * The dashboard's one asymmetrical "state of things" composition (spec
 * section 2) — two progress rings on the left, three unevenly-weighted
 * metric tiles on the right, reading as a single deliberate layout rather
 * than four-to-six identical SaaS cards.
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

      <div className="flex flex-col gap-3 sm:flex-row lg:col-span-5">
        <ProgressGauge
          percent={profileStrengthPercent}
          label="Profile readiness"
          sublabel="Documentation completeness — not verification"
          tone="primary"
        />
        <ProgressGauge
          percent={applicationMomentumPercent}
          label="Application momentum"
          sublabel={momentumSublabel}
          tone="success"
        />
      </div>

      <div className="grid grid-cols-2 grid-rows-2 gap-3 lg:col-span-7">
        <MetricTile
          label="Strong matches"
          value={strongMatchCount}
          icon={Sparkles}
          tone="success"
          href="/opportunities"
          span="col-span-1 row-span-2"
        />
        <MetricTile
          label="Saved"
          value={savedCount}
          icon={Bookmark}
          tone="gold"
          href="/saved"
          span="col-span-1 row-span-1"
        />
        <MetricTile
          label="Deadlines"
          value={upcomingDeadlineCount}
          icon={CalendarClock}
          tone="coral"
          secondary="next 14 days"
          href="/applications"
          span="col-span-1 row-span-1"
        />
      </div>
    </section>
  );
}

export { DashboardOverview };

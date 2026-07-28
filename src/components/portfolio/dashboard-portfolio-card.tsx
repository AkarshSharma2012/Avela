import Link from "next/link";

import { ProfileStrengthMeter } from "@/components/portfolio/profile-strength-meter";
import { buttonVariants } from "@/components/ui/button";
import type { PortfolioDashboardSummary } from "@/lib/portfolio/dashboard";
import { cn } from "@/lib/utils";

/** The dashboard's deliberately small Portfolio card (spec section 9: "do not overcrowd the dashboard") — strength meter without the full reason breakdown, plus the two counts that actually call for action. */
function DashboardPortfolioCard({ summary }: { summary: PortfolioDashboardSummary }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <ProfileStrengthMeter strength={summary.profileStrength} showReasons={false} />
        {(summary.incompleteItemCount > 0 || summary.applicationsMissingEvidenceCount > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-foreground">
            {summary.incompleteItemCount > 0 && (
              <span>
                <strong className="font-heading text-lg">{summary.incompleteItemCount}</strong>{" "}
                {summary.incompleteItemCount === 1 ? "item needs" : "items need"} details
              </span>
            )}
            {summary.applicationsMissingEvidenceCount > 0 && (
              <span className="text-text-secondary">
                <strong className="font-heading text-lg">{summary.applicationsMissingEvidenceCount}</strong>{" "}
                {summary.applicationsMissingEvidenceCount === 1 ? "application" : "applications"} missing evidence
              </span>
            )}
          </div>
        )}
      </div>
      <Link href="/portfolio" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}>
        View Portfolio
      </Link>
    </div>
  );
}

export { DashboardPortfolioCard };

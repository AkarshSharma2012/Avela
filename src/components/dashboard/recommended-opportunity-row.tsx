import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { MatchSignal } from "@/components/ui/discovery-pulse";
import { OpportunityTypeIcon } from "@/components/opportunities/opportunity-type-icon";
import { SaveButton } from "@/components/opportunities/save-button";
import { formatShortDate } from "@/lib/opportunities/format";
import type { MatchResult, MatchTier } from "@/lib/opportunities/matching";
import { cn } from "@/lib/utils";
import type { Opportunity } from "@/types/opportunity";

const TIER_TEXT: Record<MatchTier, string> = {
  strong_fit: "text-success",
  possible_fit: "text-primary",
  limited_fit: "text-muted-foreground",
};

const TIER_LABEL: Record<MatchTier, string> = {
  strong_fit: "Strong fit",
  possible_fit: "Possible fit",
  limited_fit: "Limited fit",
};

/**
 * One scannable row in the dashboard's compact "Recommended" list (spec
 * section 4) — type icon, title, top match reason, deadline, match
 * strength, save state, open action. Deliberately lighter than the full
 * OpportunityCard/FeaturedMatchCard (no eligibility badge, no feedback
 * controls) — those stay on the Opportunities list and detail page.
 */
function RecommendedOpportunityRow({
  opportunity,
  matchResult,
  isSaved,
  whyItFits,
}: {
  opportunity: Opportunity;
  matchResult: MatchResult;
  isSaved: boolean;
  whyItFits: string | null;
}) {
  return (
    <div className="-mx-2 flex items-center gap-3 rounded-md px-2 py-3 transition-colors hover:bg-secondary/50">
      <OpportunityTypeIcon type={opportunity.opportunity_type} className="size-8" />

      <Link
        href={`/opportunities/${opportunity.id}`}
        className="min-w-0 flex-1 rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        <p className="truncate text-sm font-semibold text-foreground">{opportunity.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {whyItFits ?? opportunity.organization}
        </p>
      </Link>

      {opportunity.application_deadline && (
        <p className="hidden shrink-0 text-xs whitespace-nowrap text-muted-foreground sm:block">
          {formatShortDate(opportunity.application_deadline)}
        </p>
      )}

      <span aria-hidden="true" className={cn("hidden shrink-0 sm:flex", TIER_TEXT[matchResult.tier])}>
        <MatchSignal tier={matchResult.tier} />
      </span>
      <span className="sr-only">{TIER_LABEL[matchResult.tier]} match</span>

      <SaveButton opportunityId={opportunity.id} initiallySaved={isSaved} size="sm" />

      <Link
        href={`/opportunities/${opportunity.id}`}
        aria-label={`View details for ${opportunity.title}`}
        className="shrink-0 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        <ChevronRight aria-hidden="true" className="size-4" />
      </Link>
    </div>
  );
}

export { RecommendedOpportunityRow };

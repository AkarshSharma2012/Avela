import Link from "next/link";
import { ArrowRight, Clock, Lightbulb, TriangleAlert } from "lucide-react";

import { EligibilityBadge } from "@/components/opportunities/eligibility-badge";
import { MatchBadge } from "@/components/opportunities/match-badge";
import { OpportunityTypeIcon } from "@/components/opportunities/opportunity-type-icon";
import {
  RecommendationFeedbackControls,
  type RecommendationFeedbackState,
} from "@/components/opportunities/recommendation-feedback-controls";
import { SaveButton } from "@/components/opportunities/save-button";
import { VerificationBadge } from "@/components/opportunities/verification-badge";
import { Chip } from "@/components/ui/chip";
import { APPLICATION_STATUS_LABELS, FORMAT_LABELS, TYPE_LABELS } from "@/lib/opportunities/constants";
import type { EligibilityResult } from "@/lib/opportunities/eligibility-engine";
import {
  formatCommitment,
  formatCost,
  formatDeadline,
  formatGradeRange,
  formatLastVerified,
  formatLocation,
  isClosingSoon,
} from "@/lib/opportunities/format";
import type { MatchResult, MatchTier } from "@/lib/opportunities/matching";
import { cn } from "@/lib/utils";
import type { Opportunity } from "@/types/opportunity";

/** A quiet left-edge accent tying a card's color to how well it fits — never the card's only signal (MatchBadge's icon+text stays the source of truth), just a scannable hint across a grid of cards. */
const TIER_ACCENT: Record<MatchTier, string> = {
  strong_fit: "border-l-primary",
  possible_fit: "border-l-signal",
  limited_fit: "border-l-border",
};

const DEFAULT_FEEDBACK_STATE: RecommendationFeedbackState = {
  moreLikeThis: false,
  remindLater: false,
  helpMeApply: false,
};

function OpportunityCard({
  opportunity,
  isSaved,
  matchResult,
  eligibilityResult,
  sourceName = null,
  showWhyItFits = false,
  feedbackState = DEFAULT_FEEDBACK_STATE,
}: {
  opportunity: Opportunity;
  isSaved: boolean;
  matchResult: MatchResult;
  eligibilityResult: EligibilityResult;
  /** The registered `opportunity_sources.name` this listing was ingested from, when known. Never fabricated — omitted entirely for sample/manually-imported rows with no source_id. */
  sourceName?: string | null;
  /** Surfaces the engine's own top match reason in a small labeled block. Off by default so existing pages (Opportunities, Saved) keep their current density; the dashboard's "Chosen for You" cards opt in. Never shown for a limited_fit result, where the top "reason" is actually a shortfall, not something to frame as "why this fits". */
  showWhyItFits?: boolean;
  /** This student's prior recommendation_feedback on this exact opportunity — same opt-in as `showWhyItFits`, since feedback only makes sense for a personalized recommendation, not a plain browse/saved listing. */
  feedbackState?: RecommendationFeedbackState;
}) {
  const showUncertaintyWarning =
    opportunity.deadline_status === "unknown" || eligibilityResult.status === "unclear";
  const whyItFits =
    showWhyItFits && matchResult.tier !== "limited_fit" ? matchResult.reasons[0] : null;
  const closingSoon =
    opportunity.deadline_status === "open" && isClosingSoon(opportunity.application_deadline);

  return (
    <article
      className={cn(
        "hover-lift group/card flex flex-col gap-3 rounded-lg border border-l-4 border-border bg-card px-5 py-4 shadow-sm",
        TIER_ACCENT[matchResult.tier]
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <OpportunityTypeIcon type={opportunity.opportunity_type} />
          <div>
            <h3 className="font-heading text-lg text-foreground">
              <Link
                href={`/opportunities/${opportunity.id}`}
                className="rounded-sm hover:underline focus-visible:underline focus-visible:outline-none"
              >
                {opportunity.title}
              </Link>
            </h3>
            <p className="text-sm text-muted-foreground">{opportunity.organization}</p>
            {sourceName && (
              <p className="text-xs text-muted-foreground">Source: {sourceName}</p>
            )}
          </div>
        </div>
        <VerificationBadge isSample={opportunity.is_sample} verificationLabel={opportunity.verification_label} />
      </div>

      <p className="line-clamp-2 text-sm leading-relaxed text-text-secondary">
        {opportunity.description}
      </p>

      <div className="flex flex-wrap gap-2">
        <MatchBadge result={matchResult} />
        <EligibilityBadge result={eligibilityResult} />
      </div>

      {whyItFits && (
        <p className="flex items-start gap-1.5 rounded-md border border-insight/25 bg-insight/10 px-3 py-2 text-xs text-insight">
          <Lightbulb aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {whyItFits}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Chip size="sm">{TYPE_LABELS[opportunity.opportunity_type]}</Chip>
        <Chip size="sm">{FORMAT_LABELS[opportunity.format]}</Chip>
        <Chip size="sm">{formatLocation(opportunity.location_text, opportunity.remote_allowed)}</Chip>
        <Chip size="sm">{formatGradeRange(opportunity.min_grade, opportunity.max_grade)}</Chip>
        <Chip size="sm">{formatCost(opportunity.cost_type, opportunity.cost_amount)}</Chip>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p className="flex flex-wrap items-center gap-1.5">
          {formatDeadline(opportunity.application_deadline)} · {APPLICATION_STATUS_LABELS[opportunity.application_status]}
          {closingSoon && (
            <span className="inline-flex items-center gap-1 rounded-full bg-coral/15 px-2 py-0.5 text-[0.7rem] font-medium text-coral">
              <Clock aria-hidden="true" className="size-3" />
              Closing soon
            </span>
          )}
        </p>
        <p>{formatCommitment(opportunity.weekly_commitment_hours, opportunity.duration_text)}</p>
        <p>{formatLastVerified(opportunity.last_verified_at)}</p>
      </div>

      {showUncertaintyWarning && (
        <p className="flex items-start gap-1.5 rounded-md border border-dashed border-muted-foreground/40 bg-secondary px-3 py-2 text-xs text-muted-foreground">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          Some details for this opportunity haven&apos;t been fully confirmed yet.
        </p>
      )}

      <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-3">
        <Link
          href={`/opportunities/${opportunity.id}`}
          className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          View details
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
        <SaveButton opportunityId={opportunity.id} initiallySaved={isSaved} />
      </div>

      {showWhyItFits && (
        <RecommendationFeedbackControls
          opportunityId={opportunity.id}
          initialState={feedbackState}
          applicationUrl={opportunity.application_url}
        />
      )}
    </article>
  );
}

export { OpportunityCard };

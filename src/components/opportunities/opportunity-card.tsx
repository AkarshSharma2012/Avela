import Link from "next/link";
import { ArrowRight, TriangleAlert } from "lucide-react";

import { EligibilityBadge } from "@/components/opportunities/eligibility-badge";
import { MatchBadge } from "@/components/opportunities/match-badge";
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
} from "@/lib/opportunities/format";
import type { MatchResult } from "@/lib/opportunities/matching";
import type { Opportunity } from "@/types/opportunity";

function OpportunityCard({
  opportunity,
  isSaved,
  matchResult,
  eligibilityResult,
  sourceName = null,
}: {
  opportunity: Opportunity;
  isSaved: boolean;
  matchResult: MatchResult;
  eligibilityResult: EligibilityResult;
  /** The registered `opportunity_sources.name` this listing was ingested from, when known. Never fabricated — omitted entirely for sample/manually-imported rows with no source_id. */
  sourceName?: string | null;
}) {
  const showUncertaintyWarning =
    opportunity.deadline_status === "unknown" || eligibilityResult.status === "unclear";

  return (
    <article className="flex flex-col gap-3 rounded-md border border-border bg-card px-5 py-4">
      <div className="flex items-start justify-between gap-3">
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
        <VerificationBadge isSample={opportunity.is_sample} verificationLabel={opportunity.verification_label} />
      </div>

      <p className="line-clamp-2 text-sm leading-relaxed text-text-secondary">
        {opportunity.description}
      </p>

      <div className="flex flex-wrap gap-2">
        <MatchBadge result={matchResult} />
        <EligibilityBadge result={eligibilityResult} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip size="sm">{TYPE_LABELS[opportunity.opportunity_type]}</Chip>
        <Chip size="sm">{FORMAT_LABELS[opportunity.format]}</Chip>
        <Chip size="sm">{formatLocation(opportunity.location_text, opportunity.remote_allowed)}</Chip>
        <Chip size="sm">{formatGradeRange(opportunity.min_grade, opportunity.max_grade)}</Chip>
        <Chip size="sm">{formatCost(opportunity.cost_type, opportunity.cost_amount)}</Chip>
      </div>

      <div className="space-y-0.5 text-xs text-muted-foreground">
        <p>
          {formatDeadline(opportunity.application_deadline)} · {APPLICATION_STATUS_LABELS[opportunity.application_status]}
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
    </article>
  );
}

export { OpportunityCard };

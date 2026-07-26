import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

import { EligibilityBadge } from "@/components/opportunities/eligibility-badge";
import { MatchBadge } from "@/components/opportunities/match-badge";
import { SaveButton } from "@/components/opportunities/save-button";
import { VerificationBadge } from "@/components/opportunities/verification-badge";
import { Chip } from "@/components/ui/chip";
import {
  APPLICATION_STATUS_LABELS,
  DEADLINE_STATUS_LABELS,
  FORMAT_LABELS,
  TYPE_LABELS,
} from "@/lib/opportunities/constants";
import type { EligibilityResult } from "@/lib/opportunities/eligibility-engine";
import {
  formatAgeRange,
  formatCommitment,
  formatCost,
  formatDeadline,
  formatGradeRange,
  formatLastVerified,
  formatLocation,
  formatMoney,
} from "@/lib/opportunities/format";
import type { MatchResult } from "@/lib/opportunities/matching";
import type { Opportunity } from "@/types/opportunity";

/**
 * The single strongest "Chosen for You" match — a larger, more explanatory
 * variant of `OpportunityCard`. Every fact shown is a real column read
 * through the same format/label helpers the detail page uses, and
 * `MatchBadge`/`EligibilityBadge` are rendered with `showReasons` so the
 * "why this was picked" explanation is the engines' own transparent
 * reasons, never a generated summary.
 */
function FeaturedMatchCard({
  opportunity,
  matchResult,
  eligibilityResult,
  isSaved,
}: {
  opportunity: Opportunity;
  matchResult: MatchResult;
  eligibilityResult: EligibilityResult;
  isSaved: boolean;
}) {
  const ageRange = formatAgeRange(opportunity.age_min, opportunity.age_max);
  const stipend = formatMoney(opportunity.stipend_amount);
  const hourlyPay = formatMoney(opportunity.hourly_pay);
  const compensation = [
    stipend ? `${stipend} stipend` : null,
    hourlyPay ? `${hourlyPay}/hour` : null,
  ].filter((part): part is string => part !== null);

  return (
    <article className="flex flex-col gap-4 rounded-lg border border-primary/30 bg-[color-mix(in_oklch,var(--primary),transparent_96%)] px-6 py-6">
      <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-primary uppercase">
        <Sparkles aria-hidden="true" className="size-3.5" />
        Featured for you
      </div>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-xl text-foreground">
            <Link
              href={`/opportunities/${opportunity.id}`}
              className="rounded-sm hover:underline focus-visible:underline focus-visible:outline-none"
            >
              {opportunity.title}
            </Link>
          </h3>
          <p className="text-sm text-muted-foreground">{opportunity.organization}</p>
        </div>
        <VerificationBadge
          isSample={opportunity.is_sample}
          verificationLabel={opportunity.verification_label}
        />
      </div>

      <p className="text-sm leading-relaxed text-text-secondary">{opportunity.description}</p>

      <div className="flex flex-col gap-3 sm:flex-row sm:gap-8">
        <MatchBadge result={matchResult} showReasons />
        <EligibilityBadge result={eligibilityResult} showReasons />
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip size="sm">{TYPE_LABELS[opportunity.opportunity_type]}</Chip>
        <Chip size="sm">{FORMAT_LABELS[opportunity.format]}</Chip>
        <Chip size="sm">{formatLocation(opportunity.location_text, opportunity.remote_allowed)}</Chip>
        <Chip size="sm">{formatGradeRange(opportunity.min_grade, opportunity.max_grade)}</Chip>
        {ageRange && <Chip size="sm">{ageRange}</Chip>}
        <Chip size="sm">{formatCost(opportunity.cost_type, opportunity.cost_amount)}</Chip>
        {compensation.map((line) => (
          <Chip key={line} size="sm">
            {line}
          </Chip>
        ))}
      </div>

      <div className="space-y-0.5 text-xs text-muted-foreground">
        <p>
          {formatDeadline(opportunity.application_deadline)} ·{" "}
          {DEADLINE_STATUS_LABELS[opportunity.deadline_status]}
        </p>
        <p>{APPLICATION_STATUS_LABELS[opportunity.application_status]}</p>
        <p>{formatCommitment(opportunity.weekly_commitment_hours, opportunity.duration_text)}</p>
        <p>{formatLastVerified(opportunity.last_verified_at)}</p>
      </div>

      <div className="mt-1 flex items-center justify-between gap-3 border-t border-primary/20 pt-4">
        <Link
          href={`/opportunities/${opportunity.id}`}
          className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          View full details
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
        <SaveButton opportunityId={opportunity.id} initiallySaved={isSaved} size="default" />
      </div>
    </article>
  );
}

export { FeaturedMatchCard };

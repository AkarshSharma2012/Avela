import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  Clock,
  Lightbulb,
  MapPin,
  Sparkles,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { EligibilityBadge } from "@/components/opportunities/eligibility-badge";
import { MatchBadge } from "@/components/opportunities/match-badge";
import {
  RecommendationFeedbackControls,
  type RecommendationFeedbackState,
} from "@/components/opportunities/recommendation-feedback-controls";
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

/** One small labeled fact — the "small labeled data blocks" the featured card scans by, instead of a dense paragraph. */
function DataBlock({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-secondary px-3 py-2">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[0.7rem] font-medium text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

/**
 * The single strongest "Chosen for You" match — a larger, more explanatory
 * variant of `OpportunityCard`. Every fact shown is a real column read
 * through the same format/label helpers the detail page uses, and
 * `MatchBadge`/`EligibilityBadge` are rendered with `showReasons` so the
 * "why this was picked" explanation is the engines' own transparent
 * reasons, never a generated summary.
 */
const DEFAULT_FEEDBACK_STATE: RecommendationFeedbackState = {
  moreLikeThis: false,
  remindLater: false,
  helpMeApply: false,
};

function FeaturedMatchCard({
  opportunity,
  matchResult,
  eligibilityResult,
  isSaved,
  feedbackState = DEFAULT_FEEDBACK_STATE,
}: {
  opportunity: Opportunity;
  matchResult: MatchResult;
  eligibilityResult: EligibilityResult;
  isSaved: boolean;
  /** This student's prior recommendation_feedback on this exact opportunity — see OpportunityCard's identical prop. */
  feedbackState?: RecommendationFeedbackState;
}) {
  const ageRange = formatAgeRange(opportunity.age_min, opportunity.age_max);
  const stipend = formatMoney(opportunity.stipend_amount);
  const hourlyPay = formatMoney(opportunity.hourly_pay);
  const costLine = [
    formatCost(opportunity.cost_type, opportunity.cost_amount),
    stipend ? `${stipend} stipend` : null,
    hourlyPay ? `${hourlyPay}/hour` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-primary/15 bg-[color-mix(in_oklch,var(--primary),transparent_94%)] px-6 py-5">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
          >
            <Sparkles className="size-4" />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-wide text-primary">Featured for you</p>
            <h3 className="mt-0.5 font-heading text-xl text-foreground">
              <Link
                href={`/opportunities/${opportunity.id}`}
                className="rounded-sm hover:underline focus-visible:underline focus-visible:outline-none"
              >
                {opportunity.title}
              </Link>
            </h3>
            <p className="text-sm text-muted-foreground">{opportunity.organization}</p>
          </div>
        </div>
        <VerificationBadge
          isSample={opportunity.is_sample}
          verificationLabel={opportunity.verification_label}
        />
      </div>

      <div className="flex flex-col gap-4 px-6 py-5">
        <p className="text-sm leading-relaxed text-text-secondary">{opportunity.description}</p>

        <div className="flex flex-col gap-3 sm:flex-row sm:gap-8">
          <MatchBadge result={matchResult} />
          <EligibilityBadge result={eligibilityResult} />
        </div>

        {matchResult.reasons.length > 0 && (
          <div className="rounded-lg border border-insight/25 bg-insight/10 px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-insight">
              <Lightbulb aria-hidden="true" className="size-3.5" />
              Why this fits you
            </p>
            <ul className="mt-1.5 space-y-1 text-sm text-foreground">
              {matchResult.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Chip size="sm">{TYPE_LABELS[opportunity.opportunity_type]}</Chip>
          <Chip size="sm">{FORMAT_LABELS[opportunity.format]}</Chip>
          <Chip size="sm">{formatGradeRange(opportunity.min_grade, opportunity.max_grade)}</Chip>
          {ageRange && <Chip size="sm">{ageRange}</Chip>}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <DataBlock
            icon={CalendarClock}
            label="Deadline"
            value={`${formatDeadline(opportunity.application_deadline)} (${DEADLINE_STATUS_LABELS[opportunity.deadline_status]}) · ${APPLICATION_STATUS_LABELS[opportunity.application_status]}`}
          />
          <DataBlock
            icon={MapPin}
            label="Location and format"
            value={formatLocation(opportunity.location_text, opportunity.remote_allowed)}
          />
          <DataBlock icon={Wallet} label="Cost" value={costLine} />
          <DataBlock
            icon={Clock}
            label="Last checked"
            value={formatLastVerified(opportunity.last_verified_at)}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          {formatCommitment(opportunity.weekly_commitment_hours, opportunity.duration_text)}
        </p>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <Link
            href={`/opportunities/${opportunity.id}`}
            className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            View full details
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
          <SaveButton opportunityId={opportunity.id} initiallySaved={isSaved} size="default" />
        </div>

        <RecommendationFeedbackControls
          opportunityId={opportunity.id}
          initialState={feedbackState}
          applicationUrl={opportunity.application_url}
        />
      </div>
    </article>
  );
}

export { FeaturedMatchCard };

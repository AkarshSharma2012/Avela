import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, TriangleAlert } from "lucide-react";

import { EligibilityBadge } from "@/components/opportunities/eligibility-badge";
import { MatchBadge } from "@/components/opportunities/match-badge";
import { SaveButton } from "@/components/opportunities/save-button";
import { VerificationBadge } from "@/components/opportunities/verification-badge";
import { buttonVariants } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { requireProfile } from "@/lib/auth/dal";
import { getOnboardingSummary } from "@/lib/onboarding/dal";
import { DEADLINE_STATUS_LABELS, FORMAT_LABELS, TYPE_LABELS } from "@/lib/opportunities/constants";
import { evaluateEligibility } from "@/lib/opportunities/eligibility-engine";
import {
  formatCommitment,
  formatCost,
  formatDateRange,
  formatDeadline,
  formatGradeRange,
  formatLastVerified,
  formatLocation,
} from "@/lib/opportunities/format";
import { buildMatchProfileInput, matchOpportunity } from "@/lib/opportunities/matching";
import { getOpportunityById, getOpportunitySourceNames, isOpportunitySaved } from "@/lib/opportunities/query";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type PageParams = { id: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const opportunity = await getOpportunityById(supabase, id);
  return { title: opportunity ? `${opportunity.title} — Avela` : "Opportunity — Avela" };
}

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { id } = await params;
  const profile = await requireProfile();

  const supabase = await createClient();
  const [opportunity, onboardingSummary, saved] = await Promise.all([
    getOpportunityById(supabase, id),
    getOnboardingSummary(profile.id),
    isOpportunitySaved(supabase, profile.id, id),
  ]);

  if (!opportunity) {
    notFound();
  }

  const matchResult = matchOpportunity(
    opportunity,
    buildMatchProfileInput(profile, onboardingSummary)
  );
  const eligibilityResult = evaluateEligibility(
    {
      minGrade: opportunity.min_grade,
      maxGrade: opportunity.max_grade,
      deadlineStatus: opportunity.deadline_status,
      applicationStatus: opportunity.application_status,
      residencyRequirements: opportunity.residency_requirements,
      citizenshipRequirements: opportunity.citizenship_requirements,
      weeklyCommitmentHours: opportunity.weekly_commitment_hours,
    },
    {
      gradeLevel: profile.grade_level,
      state: profile.state,
      weeklyAvailability: profile.weekly_availability,
    }
  );
  const dateRange = formatDateRange(opportunity.start_date, opportunity.end_date);
  const sourceName = opportunity.source_id
    ? ((await getOpportunitySourceNames(supabase, [opportunity.source_id])).get(opportunity.source_id) ?? null)
    : null;
  const showUncertaintyWarning =
    opportunity.deadline_status === "unknown" || eligibilityResult.status === "unclear";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-6 py-10 sm:py-12">
      <Link
        href="/opportunities"
        className="animate-fade-up inline-flex w-fit items-center gap-1.5 rounded-sm text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        <ArrowLeft aria-hidden="true" className="size-3.5" />
        Back to Opportunities
      </Link>

      <div className="stagger-children mt-6">
        <div className="animate-fade-up flex items-start justify-between gap-3">
          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-primary uppercase">
              {TYPE_LABELS[opportunity.opportunity_type]}
            </p>
            <h1 className="font-heading text-3xl text-foreground sm:text-4xl">
              {opportunity.title}
            </h1>
            <p className="mt-1 text-base text-muted-foreground">{opportunity.organization}</p>
            {sourceName && <p className="mt-0.5 text-sm text-muted-foreground">Source: {sourceName}</p>}
          </div>
          <VerificationBadge
            isSample={opportunity.is_sample}
            isVerified={opportunity.is_verified}
          />
        </div>

        <p className="animate-fade-up mt-5 max-w-2xl text-base leading-relaxed text-text-secondary">
          {opportunity.description}
        </p>

        {opportunity.is_sample && (
          <p className="animate-fade-up mt-4 rounded-md border border-dashed border-muted-foreground/40 bg-secondary px-4 py-3 text-sm text-muted-foreground">
            This is sample data for development only — it is not a real, live opportunity.
          </p>
        )}

        {showUncertaintyWarning && (
          <p className="animate-fade-up mt-4 flex items-start gap-2 rounded-md border border-dashed border-muted-foreground/40 bg-secondary px-4 py-3 text-sm text-muted-foreground">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            Some details for this opportunity haven&apos;t been fully confirmed yet — double-check
            before applying.
          </p>
        )}

        <div className="animate-fade-up mt-6 flex flex-wrap gap-2">
          <Chip>{FORMAT_LABELS[opportunity.format]}</Chip>
          <Chip>{formatLocation(opportunity.location_text, opportunity.remote_allowed)}</Chip>
          <Chip>{formatGradeRange(opportunity.min_grade, opportunity.max_grade)}</Chip>
          <Chip>{formatCost(opportunity.cost_type, opportunity.cost_amount)}</Chip>
        </div>

        <section aria-labelledby="match-heading" className="animate-fade-up mt-8">
          <h2
            id="match-heading"
            className="text-xs font-medium tracking-wide text-primary uppercase"
          >
            Your match
          </h2>
          <div className="mt-3 flex flex-col gap-4 rounded-md border border-border bg-card px-5 py-4 sm:flex-row sm:gap-8">
            <MatchBadge result={matchResult} showReasons />
            <EligibilityBadge result={eligibilityResult} showReasons />
          </div>
        </section>

        <section aria-labelledby="details-heading" className="animate-fade-up mt-8">
          <h2
            id="details-heading"
            className="text-xs font-medium tracking-wide text-primary uppercase"
          >
            Details
          </h2>
          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-border bg-card px-5 py-4">
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Deadline
              </dt>
              <dd className="mt-1 text-base text-foreground">
                {formatDeadline(opportunity.application_deadline)}
              </dd>
              <dd className="mt-1 text-sm text-muted-foreground">
                {DEADLINE_STATUS_LABELS[opportunity.deadline_status]}
              </dd>
            </div>
            <div className="rounded-md border border-border bg-card px-5 py-4">
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Verification
              </dt>
              <dd className="mt-1 text-base text-foreground">
                {formatLastVerified(opportunity.last_verified_at)}
              </dd>
            </div>
            {dateRange && (
              <div className="rounded-md border border-border bg-card px-5 py-4">
                <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Dates
                </dt>
                <dd className="mt-1 text-base text-foreground">{dateRange}</dd>
              </div>
            )}
            <div className="rounded-md border border-border bg-card px-5 py-4">
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Commitment
              </dt>
              <dd className="mt-1 text-base text-foreground">
                {formatCommitment(opportunity.weekly_commitment_hours, opportunity.duration_text)}
              </dd>
            </div>
            <div className="rounded-md border border-border bg-card px-5 py-4">
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Cost
              </dt>
              <dd className="mt-1 text-base text-foreground">
                {formatCost(opportunity.cost_type, opportunity.cost_amount)}
              </dd>
            </div>
          </dl>
        </section>

        <div className="animate-fade-up mt-8 flex flex-wrap items-center gap-3 border-t border-border pt-6">
          <a
            href={opportunity.application_url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "default" }), "gap-1.5")}
          >
            Apply now
            <ExternalLink aria-hidden="true" className="size-3.5" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          {opportunity.source_url && (
            <a
              href={opportunity.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              View source
              <ExternalLink aria-hidden="true" className="size-3" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
          <div className="ml-auto">
            <SaveButton opportunityId={opportunity.id} initiallySaved={saved} size="default" />
          </div>
        </div>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft, ExternalLink, TriangleAlert } from "lucide-react";

import { EligibilityBadge } from "@/components/opportunities/eligibility-badge";
import { MatchBadge } from "@/components/opportunities/match-badge";
import { SaveButton } from "@/components/opportunities/save-button";
import { VerificationBadge } from "@/components/opportunities/verification-badge";
import { buttonVariants } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { requireProfile } from "@/lib/auth/dal";
import { getOnboardingSummary } from "@/lib/onboarding/dal";
import { APPLICATION_STATUS_LABELS, DEADLINE_STATUS_LABELS, FORMAT_LABELS, TYPE_LABELS } from "@/lib/opportunities/constants";
import { evaluateEligibility } from "@/lib/opportunities/eligibility-engine";
import {
  formatAgeRange,
  formatCommitment,
  formatCost,
  formatDateRange,
  formatDeadline,
  formatGradeRange,
  formatLastVerified,
  formatLocation,
  formatMoney,
  formatRequirement,
} from "@/lib/opportunities/format";
import { buildMatchProfileInput, matchOpportunity } from "@/lib/opportunities/matching";
import {
  getOpportunityById,
  getOpportunitySourceLinks,
  isOpportunitySaved,
} from "@/lib/opportunities/query";
import { VERIFICATION_LABEL_TEXT } from "@/lib/opportunities/verification-labels";
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

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="animate-fade-up mt-8">
      <h2 id={id} className="text-xs font-medium tracking-wide text-primary uppercase">
        {title}
      </h2>
      <div className="mt-3 rounded-md border border-border bg-card px-5 py-4">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (value === null) return null;
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{value}</dd>
    </div>
  );
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
  const sourceLinks = await getOpportunitySourceLinks(supabase, opportunity.id);

  // --- Grouped uncertainty warnings (spec section 7: one warning section, --
  // never scattered "Cost: Unknown" rows).
  const uncertainties = new Set<string>();
  if (opportunity.deadline_status === "unknown") uncertainties.add("The exact deadline for this opportunity isn't confirmed yet.");
  if (opportunity.application_status === "unknown") uncertainties.add("It's unclear whether this opportunity is currently accepting applications.");
  if (opportunity.eligibility_status !== "defined") uncertainties.add("Full eligibility criteria haven't been fully confirmed.");
  if (eligibilityResult.status === "unclear") {
    for (const reason of eligibilityResult.reasons) uncertainties.add(reason);
  }
  if (opportunity.has_unresolved_conflict) {
    uncertainties.add("Different sources disagree about some details for this listing — it's pending review.");
  }
  if (opportunity.verification_label === "stale") {
    uncertainties.add("This listing hasn't been reverified recently — some details may be out of date.");
  }

  // --- Requirement rows (application requirements section) — only real
  // yes/no answers are ever shown, never a fabricated "unknown" row.
  const requirementRows = [
    formatRequirement(opportunity.essay_required, "Essay/personal statement"),
    formatRequirement(opportunity.recommendation_required, "Letter of recommendation"),
    formatRequirement(opportunity.transcript_required, "Official transcript"),
    formatRequirement(opportunity.interview_required, "Interview"),
    formatRequirement(opportunity.parent_consent_required, "Parent/guardian consent"),
  ].filter((row): row is string => row !== null);

  const skills = opportunity.extended_details.skills ?? [];
  const requiredDocuments = opportunity.extended_details.required_documents ?? [];

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
        {/* --- Overview --- */}
        <div className="animate-fade-up flex items-start justify-between gap-3">
          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-primary uppercase">
              {TYPE_LABELS[opportunity.opportunity_type]}
            </p>
            <h1 className="font-heading text-3xl text-foreground sm:text-4xl">
              {opportunity.title}
            </h1>
            <p className="mt-1 text-base text-muted-foreground">{opportunity.organization}</p>
          </div>
          <VerificationBadge isSample={opportunity.is_sample} verificationLabel={opportunity.verification_label} />
        </div>

        <p className="animate-fade-up mt-5 max-w-2xl text-base leading-relaxed text-text-secondary">
          {opportunity.description}
        </p>

        {opportunity.is_sample && (
          <p className="animate-fade-up mt-4 rounded-md border border-dashed border-muted-foreground/40 bg-secondary px-4 py-3 text-sm text-muted-foreground">
            This is sample data for development only — it is not a real, live opportunity.
          </p>
        )}

        <div className="animate-fade-up mt-6 flex flex-wrap gap-2">
          <Chip>{FORMAT_LABELS[opportunity.format]}</Chip>
          <Chip>{formatLocation(opportunity.location_text, opportunity.remote_allowed)}</Chip>
          <Chip>{formatGradeRange(opportunity.min_grade, opportunity.max_grade)}</Chip>
          <Chip>{formatCost(opportunity.cost_type, opportunity.cost_amount)}</Chip>
        </div>

        {/* --- Why it may fit you --- */}
        <Section id="fit-heading" title="Why it may fit you">
          <div className="flex flex-col gap-4 sm:flex-row sm:gap-8">
            <MatchBadge result={matchResult} showReasons />
            <EligibilityBadge result={eligibilityResult} showReasons />
          </div>
        </Section>

        {/* --- Eligibility --- */}
        <Section id="eligibility-heading" title="Eligibility">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Grade range" value={formatGradeRange(opportunity.min_grade, opportunity.max_grade)} />
            <Field label="Age range" value={formatAgeRange(opportunity.age_min, opportunity.age_max)} />
            <Field
              label="School enrollment"
              value={formatRequirement(opportunity.school_enrollment_required, "Current school enrollment")}
            />
            <Field label="Residency" value={opportunity.residency_requirements} />
            <Field label="Citizenship" value={opportunity.citizenship_requirements} />
            <Field label="Required documents" value={requiredDocuments.length > 0 ? requiredDocuments.join(", ") : null} />
          </dl>
        </Section>

        {/* --- Dates and deadline --- */}
        <Section id="dates-heading" title="Dates and deadline">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Deadline" value={formatDeadline(opportunity.application_deadline)} />
            <Field label="Deadline status" value={DEADLINE_STATUS_LABELS[opportunity.deadline_status]} />
            <Field label="Application status" value={APPLICATION_STATUS_LABELS[opportunity.application_status]} />
            <Field
              label="Applications open"
              value={opportunity.application_opens_at ? formatDeadline(opportunity.application_opens_at) : null}
            />
            <Field label="Program dates" value={dateRange} />
            <Field
              label="Notification date"
              value={opportunity.notification_date ? formatDeadline(opportunity.notification_date) : null}
            />
          </dl>
        </Section>

        {/* --- Location and format --- */}
        <Section id="location-heading" title="Location and format">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Format" value={FORMAT_LABELS[opportunity.format]} />
            <Field label="Location" value={formatLocation(opportunity.location_text, opportunity.remote_allowed)} />
          </dl>
        </Section>

        {/* --- Time commitment --- */}
        <Section id="commitment-heading" title="Time commitment">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Weekly commitment"
              value={formatCommitment(opportunity.weekly_commitment_hours, opportunity.duration_text)}
            />
            <Field label="Schedule" value={opportunity.schedule_text} />
            <Field label="Attendance" value={opportunity.attendance_requirements} />
          </dl>
        </Section>

        {/* --- Cost, pay, or stipend --- */}
        <Section id="cost-heading" title="Cost, pay, or stipend">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Cost" value={formatCost(opportunity.cost_type, opportunity.cost_amount)} />
            <Field label="Stipend" value={formatMoney(opportunity.stipend_amount)} />
            <Field label="Hourly pay" value={opportunity.hourly_pay ? `${formatMoney(opportunity.hourly_pay)}/hour` : null} />
            <Field label="Financial aid" value={opportunity.financial_aid_available ? "Available" : null} />
            <Field label="Transportation" value={opportunity.transportation_support ? "Provided" : null} />
            <Field label="Housing" value={opportunity.housing_support ? "Provided" : null} />
          </dl>
        </Section>

        {/* --- What participants do --- */}
        {(skills.length > 0 || opportunity.extended_details.certificate_or_credit) && (
          <Section id="participate-heading" title="What participants do">
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Skills" value={skills.length > 0 ? skills.join(", ") : null} />
              <Field label="Certificate/credit" value={opportunity.extended_details.certificate_or_credit ?? null} />
            </dl>
          </Section>
        )}

        {/* --- Application requirements --- */}
        <Section id="requirements-heading" title="Application requirements">
          {requirementRows.length === 0 && !opportunity.application_contact ? (
            <p className="text-sm text-muted-foreground">No specific application requirements found on the source page.</p>
          ) : (
            <ul className="space-y-1 text-sm text-foreground">
              {requirementRows.map((row) => (
                <li key={row}>{row}</li>
              ))}
              {opportunity.application_contact && <li>Contact: {opportunity.application_contact}</li>}
            </ul>
          )}
        </Section>

        {/* --- How to apply --- */}
        <Section id="apply-heading" title="How to apply">
          <div className="flex flex-wrap items-center gap-3">
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
            <SaveButton opportunityId={opportunity.id} initiallySaved={saved} size="default" />
          </div>
        </Section>

        {/* --- Verification and source information --- */}
        <Section id="verification-heading" title="Verification and source information">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Verification" value={VERIFICATION_LABEL_TEXT[opportunity.verification_label]} />
            <Field label="Last checked" value={formatLastVerified(opportunity.last_verified_at)} />
          </dl>
          {sourceLinks.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Official source(s)</p>
              <ul className="mt-2 space-y-1">
                {sourceLinks.map((link) => (
                  <li key={link.sourceId}>
                    <a
                      href={link.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {link.sourceName}
                      {link.isPrimary && " (primary)"}
                      <ExternalLink aria-hidden="true" className="size-3" />
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            opportunity.source_url && (
              <div className="mt-4">
                <a
                  href={opportunity.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  View source
                  <ExternalLink aria-hidden="true" className="size-3" />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </div>
            )
          )}
        </Section>

        {/* --- Important uncertainties --- */}
        {uncertainties.size > 0 && (
          <Section id="uncertainties-heading" title="Important uncertainties">
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {[...uncertainties].map((warning) => (
                <li key={warning} className="flex items-start gap-2">
                  <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  {warning}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { AlertTriangle, Compass } from "lucide-react";

import { OpportunityCard } from "@/components/opportunities/opportunity-card";
import { OpportunityFilterForm } from "@/components/opportunities/opportunity-filter-form";
import { Pagination } from "@/components/opportunities/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { requireProfile } from "@/lib/auth/dal";
import { getOnboardingSummary } from "@/lib/onboarding/dal";
import { PAGE_SIZE } from "@/lib/opportunities/constants";
import { evaluateEligibility } from "@/lib/opportunities/eligibility-engine";
import { buildMatchProfileInput, matchOpportunity } from "@/lib/opportunities/matching";
import {
  getOpportunitySourceNames,
  getSavedOpportunityIds,
  listOpportunities,
} from "@/lib/opportunities/query";
import {
  hasActiveFilters,
  parseOpportunityFilters,
  type RawSearchParams,
} from "@/lib/opportunities/search-params";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Opportunities — Avela",
};

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const profile = await requireProfile();
  const filters = parseOpportunityFilters(await searchParams);

  const supabase = await createClient();
  const onboardingSummary = await getOnboardingSummary(profile.id);
  const [{ data: opportunities, count, error }, savedIds] = await Promise.all([
    listOpportunities(supabase, filters, profile.grade_level, {
      studentState: profile.state,
      studentInterestTags: onboardingSummary.interests,
    }),
    getSavedOpportunityIds(supabase, profile.id),
  ]);

  const matchProfileInput = buildMatchProfileInput(profile, onboardingSummary);
  const filtersActive = hasActiveFilters(filters);
  const sourceNames = await getOpportunitySourceNames(
    supabase,
    opportunities.map((o) => o.source_id).filter((id): id is string => id !== null)
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col px-6 py-10 sm:py-12">
      <div className="stagger-children">
        <p className="animate-fade-up mb-3 text-xs font-medium tracking-wide text-primary uppercase">
          Opportunities
        </p>
        <h1 className="animate-fade-up font-heading text-3xl text-foreground sm:text-4xl">
          Find your next opportunity.
        </h1>
        <p className="animate-fade-up mt-3 max-w-lg text-base leading-relaxed text-text-secondary">
          Search, filter, and save opportunities that match your interests and availability.
        </p>
      </div>

      <div className="animate-fade-up mt-8 rounded-md border border-border bg-card p-5">
        <OpportunityFilterForm filters={filters} hasGradeLevel={profile.grade_level !== null} />
      </div>

      <div className="mt-8">
        {error ? (
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load opportunities."
            description={error}
          />
        ) : opportunities.length === 0 ? (
          <EmptyState
            icon={Compass}
            title={
              filtersActive ? "No opportunities match your filters." : "No opportunities yet."
            }
            description={
              filtersActive
                ? "Try widening your search or clearing filters."
                : "Check back soon — new opportunities are added regularly."
            }
            action={filtersActive ? { label: "Clear filters", href: "/opportunities" } : undefined}
          />
        ) : (
          <>
            <p role="status" className="mb-4 text-sm text-muted-foreground">
              {count} {count === 1 ? "opportunity" : "opportunities"} found
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {opportunities.map((opportunity) => (
                <OpportunityCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  isSaved={savedIds.has(opportunity.id)}
                  matchResult={matchOpportunity(opportunity, matchProfileInput)}
                  sourceName={opportunity.source_id ? (sourceNames.get(opportunity.source_id) ?? null) : null}
                  eligibilityResult={evaluateEligibility(
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
                  )}
                />
              ))}
            </div>
            <Pagination filters={filters} totalCount={count} pageSize={PAGE_SIZE} />
          </>
        )}
      </div>
    </div>
  );
}

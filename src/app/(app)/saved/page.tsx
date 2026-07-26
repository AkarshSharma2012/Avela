import type { Metadata } from "next";
import { Bookmark } from "lucide-react";

import { OpportunityCard } from "@/components/opportunities/opportunity-card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireProfile } from "@/lib/auth/dal";
import { getOnboardingSummary } from "@/lib/onboarding/dal";
import { evaluateEligibility } from "@/lib/opportunities/eligibility-engine";
import { buildMatchProfileInput, matchOpportunity } from "@/lib/opportunities/matching";
import { getOpportunitySourceNames, getSavedOpportunities } from "@/lib/opportunities/query";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Saved — Avela",
};

export default async function SavedPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [savedEntries, onboardingSummary] = await Promise.all([
    getSavedOpportunities(supabase, profile.id),
    getOnboardingSummary(profile.id),
  ]);

  const matchProfileInput = buildMatchProfileInput(profile, onboardingSummary);
  const sourceNames = await getOpportunitySourceNames(
    supabase,
    savedEntries.map(({ opportunity }) => opportunity.source_id).filter((id): id is string => id !== null)
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col px-6 py-10 sm:py-12">
      <div className="stagger-children">
        <p className="animate-fade-up mb-3 text-xs font-medium tracking-wide text-primary uppercase">
          Saved
        </p>
        <h1 className="animate-fade-up font-heading text-3xl text-foreground sm:text-4xl">
          Opportunities you save.
        </h1>
        <p className="animate-fade-up mt-3 max-w-lg text-base leading-relaxed text-text-secondary">
          Save an opportunity while browsing and it will appear here, ready to revisit later.
        </p>
      </div>

      <div className="animate-fade-up mt-8">
        {savedEntries.length === 0 ? (
          <EmptyState
            icon={Bookmark}
            title="Nothing saved yet."
            description="Once you save an opportunity, it will show up here."
            action={{ label: "Explore Opportunities", href: "/opportunities" }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {savedEntries.map(({ opportunity }) => (
              <OpportunityCard
                key={opportunity.id}
                opportunity={opportunity}
                isSaved
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
        )}
      </div>
    </div>
  );
}

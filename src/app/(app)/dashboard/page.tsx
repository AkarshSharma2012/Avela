import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Bookmark, Compass } from "lucide-react";

import { FeaturedMatchCard } from "@/components/opportunities/featured-match-card";
import { FindMoreButton } from "@/components/opportunities/find-more-button";
import { OpportunityCard } from "@/components/opportunities/opportunity-card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { NodeTrack, type TrackNode } from "@/components/ui/node-track";
import { requireProfile } from "@/lib/auth/dal";
import { getOnboardingSummary } from "@/lib/onboarding/dal";
import {
  EXPERIENCE_LEVEL_OPTIONS,
  WEEKLY_AVAILABILITY_OPTIONS,
} from "@/lib/onboarding/constants";
import { buildChosenForYou } from "@/lib/opportunities/chosen-for-you";
import { buildMatchProfileInput } from "@/lib/opportunities/matching";
import {
  getOpportunitySourceNames,
  getSavedOpportunityIds,
  listOpportunitiesForMatching,
} from "@/lib/opportunities/query";
import { getFirstName } from "@/lib/profile/display";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Dashboard — Avela",
};

const JOURNEY: TrackNode[] = [
  { key: "profile", label: "Profile complete", state: "done" },
  { key: "personalization", label: "Personalization ready", state: "done" },
  { key: "opportunities", label: "Matches ready", state: "done" },
];

/** Malformed/negative/missing `?shown=` degrades to the first page rather than throwing — same "bad URL never 500s" rule `parseOpportunityFilters` follows. */
function parseShown(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function ChipList({ items, emptyLabel }: { items: string[]; emptyLabel: string }) {
  if (items.length === 0) {
    return <span className="text-sm text-text-secondary">{emptyLabel}</span>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Chip key={item}>{item}</Chip>
      ))}
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireProfile();
  const firstName = getFirstName(profile);
  const onboardingSummary = await getOnboardingSummary(profile.id);
  const { interests, otherInterestText, goals } = onboardingSummary;

  const interestChips = interests.map((interest) =>
    interest === "Other" && otherInterestText ? `Other (${otherInterestText})` : interest
  );
  const weeklyAvailabilityLabel = WEEKLY_AVAILABILITY_OPTIONS.find(
    (option) => option.value === profile.weekly_availability
  )?.label;
  const experienceLevelLabel = EXPERIENCE_LEVEL_OPTIONS.find(
    (option) => option.value === profile.experience_level
  )?.label;

  const shown = parseShown((await searchParams).shown);
  const supabase = await createClient();
  const [{ data: candidatePool, error: poolError }, savedIds] = await Promise.all([
    listOpportunitiesForMatching(supabase, profile.grade_level, { studentState: profile.state }),
    getSavedOpportunityIds(supabase, profile.id),
  ]);

  const matchProfileInput = buildMatchProfileInput(profile, onboardingSummary);
  const chosenForYou = buildChosenForYou(candidatePool, matchProfileInput, shown);

  const chosenSourceIds = [
    ...(chosenForYou.featured ? [chosenForYou.featured.opportunity.source_id] : []),
    ...chosenForYou.additional.map((entry) => entry.opportunity.source_id),
  ].filter((id): id is string => id !== null);
  const chosenSourceNames = await getOpportunitySourceNames(supabase, chosenSourceIds);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col px-6 py-10 sm:py-12">
      <div className="stagger-children">
        <p className="animate-fade-up mb-3 text-xs font-medium tracking-wide text-primary uppercase">
          Dashboard
        </p>
        <h1 className="animate-fade-up font-heading text-3xl text-foreground sm:text-4xl">
          Welcome back, {firstName}.
        </h1>
        <p className="animate-fade-up mt-3 max-w-lg text-base leading-relaxed text-text-secondary">
          Here&apos;s your foundation, your path, and what&apos;s coming next.
        </p>
      </div>

      <section aria-labelledby="foundation-heading" className="animate-fade-up mt-10">
        <h2
          id="foundation-heading"
          className="text-xs font-medium tracking-wide text-primary uppercase"
        >
          Your foundation
        </h2>

        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-border bg-card px-5 py-4">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Grade level
            </dt>
            <dd className="mt-1 text-base text-foreground">
              {profile.grade_level ? `Grade ${profile.grade_level}` : "Not set"}
            </dd>
          </div>

          <div className="rounded-md border border-border bg-card px-5 py-4">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Guided Mode
            </dt>
            <dd className="mt-1 text-base text-foreground">
              {profile.guided_mode ? "On" : "Off"}
            </dd>
          </div>

          <div className="rounded-md border border-border bg-card px-5 py-4">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Weekly availability
            </dt>
            <dd className="mt-1 text-base text-foreground">
              {weeklyAvailabilityLabel ?? "Not set"}
            </dd>
          </div>

          <div className="rounded-md border border-border bg-card px-5 py-4">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Experience level
            </dt>
            <dd className="mt-1 text-base text-foreground">
              {experienceLevelLabel ?? "Not set"}
            </dd>
          </div>

          <div className="rounded-md border border-border bg-card px-5 py-4 sm:col-span-2">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Interests
            </dt>
            <dd className="mt-2">
              <ChipList items={interestChips} emptyLabel="Not set" />
            </dd>
          </div>

          <div className="rounded-md border border-border bg-card px-5 py-4 sm:col-span-2">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Current goals
            </dt>
            <dd className="mt-2">
              <ChipList items={goals} emptyLabel="Not set" />
            </dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="path-heading"
        className="animate-fade-up relative mt-8 overflow-hidden rounded-md border border-primary/20 bg-[color-mix(in_oklch,var(--primary),transparent_95%)] px-6 py-6"
      >
        <h2
          id="path-heading"
          className="text-xs font-medium tracking-wide text-primary uppercase"
        >
          Your path
        </h2>
        <p className="mt-1 font-heading text-xl text-foreground">Your foundation is ready.</p>
        <div className="mt-5">
          <NodeTrack nodes={JOURNEY} size="md" hideConnectorBelowSm />
        </div>
      </section>

      <section aria-labelledby="discovery-heading" className="animate-fade-up mt-8">
        <h2
          id="discovery-heading"
          className="text-xs font-medium tracking-wide text-primary uppercase"
        >
          Chosen for you
        </h2>

        <div className="mt-4 flex flex-col gap-4">
          {poolError ? (
            <EmptyState icon={AlertTriangle} title="Couldn't load your matches." description={poolError} />
          ) : chosenForYou.status === "empty" ? (
            <EmptyState
              icon={Compass}
              title="We haven't verified any opportunities matching your profile yet."
              description="Check back soon as more are verified, or browse everything we have so far."
              action={{ label: "Browse Opportunities", href: "/opportunities" }}
            />
          ) : (
            <>
              {chosenForYou.featured && (
                <FeaturedMatchCard
                  opportunity={chosenForYou.featured.opportunity}
                  matchResult={chosenForYou.featured.matchResult}
                  eligibilityResult={chosenForYou.featured.eligibilityResult}
                  isSaved={savedIds.has(chosenForYou.featured.opportunity.id)}
                />
              )}

              {chosenForYou.additional.length > 0 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {chosenForYou.additional.map((entry) => (
                    <OpportunityCard
                      key={entry.opportunity.id}
                      opportunity={entry.opportunity}
                      isSaved={savedIds.has(entry.opportunity.id)}
                      matchResult={entry.matchResult}
                      eligibilityResult={entry.eligibilityResult}
                      sourceName={
                        entry.opportunity.source_id
                          ? (chosenSourceNames.get(entry.opportunity.source_id) ?? null)
                          : null
                      }
                    />
                  ))}
                </div>
              )}

              {chosenForYou.status === "exhausted" && (
                <p role="status" className="text-sm text-muted-foreground">
                  That&apos;s everything I&apos;ve verified for your profile so far.
                </p>
              )}

              {chosenForYou.status === "only_broader_remaining" && chosenForYou.nextShown !== null && (
                <div className="flex flex-col items-start gap-3">
                  <p role="status" className="text-sm text-muted-foreground">
                    I found a few more, but they are not as closely matched to your interests and
                    preferences.
                  </p>
                  <FindMoreButton nextShown={chosenForYou.nextShown} />
                </div>
              )}

              {chosenForYou.status === "has_more" && chosenForYou.nextShown !== null && (
                <div>
                  <FindMoreButton nextShown={chosenForYou.nextShown} />
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <section aria-labelledby="saved-heading" className="animate-fade-up mt-8">
        <h2
          id="saved-heading"
          className="text-xs font-medium tracking-wide text-primary uppercase"
        >
          Saved for later
        </h2>
        <div className="mt-4">
          <EmptyState
            icon={Bookmark}
            title="Nothing saved yet."
            description="Opportunities you save will show up here."
            action={{ label: "Explore Opportunities", href: "/opportunities" }}
          />
        </div>
      </section>

      <p className="animate-fade-up mt-8 text-sm text-muted-foreground">
        Want to look around yourself instead? Browse the full{" "}
        <Link href="/opportunities" className="text-primary underline-offset-4 hover:underline">
          Opportunities
        </Link>{" "}
        list.
      </p>
    </div>
  );
}

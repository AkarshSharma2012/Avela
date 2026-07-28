import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Bookmark,
  CalendarClock,
  Compass,
  Layers,
  TrendingUp,
} from "lucide-react";

import { DiscoverMore } from "@/components/opportunities/discover-more";
import { FeaturedMatchCard } from "@/components/opportunities/featured-match-card";
import { FindMoreButton } from "@/components/opportunities/find-more-button";
import { OpportunityCard } from "@/components/opportunities/opportunity-card";
import type { RecommendationFeedbackState } from "@/components/opportunities/recommendation-feedback-controls";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { NodeTrack, type TrackNode } from "@/components/ui/node-track";
import { requireProfile } from "@/lib/auth/dal";
import { getOnboardingSummary } from "@/lib/onboarding/dal";
import {
  EXPERIENCE_LEVEL_OPTIONS,
  PREFERENCE_GROUPS,
  WEEKLY_AVAILABILITY_OPTIONS,
} from "@/lib/onboarding/constants";
import type { ChosenForYouEntry } from "@/lib/opportunities/chosen-for-you";
import { buildChosenForYou } from "@/lib/opportunities/chosen-for-you";
import { TYPE_LABELS } from "@/lib/opportunities/constants";
import {
  getDismissedOpportunityIds,
  getFeedbackProfileForUser,
  getFeedbackStateForOpportunities,
} from "@/lib/opportunities/feedback-repository";
import { buildMatchProfileInput } from "@/lib/opportunities/matching";
import {
  getOpportunitySourceNames,
  getSavedOpportunityIds,
  listOpportunitiesForMatching,
} from "@/lib/opportunities/query";
import { getFirstName } from "@/lib/profile/display";
import { createClient } from "@/lib/supabase/server";
import type { OpportunityPreferenceKey, RecommendationFeedbackType } from "@/types/database";
import type { Opportunity } from "@/types/opportunity";

/** Flattened `value → label` lookup built once from the grouped preference options — no separate label map to keep in sync. */
const PREFERENCE_LABELS: Partial<Record<OpportunityPreferenceKey, string>> = Object.fromEntries(
  PREFERENCE_GROUPS.flatMap((group) => group.options.map((option) => [option.value, option.label]))
);

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

/** Converts the repository's `Set<feedback_type>` into the small typed shape the card components render — see recommendation-feedback-controls.tsx. */
function toFeedbackState(types: ReadonlySet<RecommendationFeedbackType> | undefined): RecommendationFeedbackState {
  return {
    moreLikeThis: types?.has("more_like_this") ?? false,
    remindLater: types?.has("remind_later") ?? false,
    helpMeApply: types?.has("help_me_apply") ?? false,
  };
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

const ACCENT_CHIP_CLASSES = {
  insight: "border-insight/25 bg-insight/10 text-insight",
  primary: "border-primary/25 bg-primary/10 text-primary",
} as const;

/** A `Chip` in one of the dashboard's two personalization accent colors — purple for interests, blue for location/grade — never used for status (MatchBadge/EligibilityBadge/VerificationBadge own that). */
function AccentChip({
  variant,
  children,
}: {
  variant: keyof typeof ACCENT_CHIP_CLASSES;
  children: string;
}) {
  return <Chip size="sm" className={ACCENT_CHIP_CLASSES[variant]}>{children}</Chip>;
}

type Insight = { icon: typeof TrendingUp; label: string; colorClass: string };

/**
 * Small, honest "at a glance" stats about the matches actually being shown
 * right now — never a claim about the full catalog, and never invented: a
 * count is only surfaced when it's greater than zero (a "most common type"
 * insight only when it genuinely covers more than half of what's shown).
 */
function buildInsights(entries: ChosenForYouEntry[]): Insight[] {
  const insights: Insight[] = [];
  if (entries.length === 0) return insights;

  const strongCount = entries.filter((entry) => entry.matchResult.tier === "strong_fit").length;
  if (strongCount > 0) {
    insights.push({
      icon: TrendingUp,
      label: `${strongCount} strong ${strongCount === 1 ? "match" : "matches"}`,
      colorClass: "border-primary/25 bg-primary/10 text-primary",
    });
  }

  const deadlineCount = entries.filter(
    (entry) => entry.opportunity.deadline_status === "open" && entry.opportunity.application_deadline !== null
  ).length;
  if (deadlineCount > 0) {
    insights.push({
      icon: CalendarClock,
      label: `${deadlineCount} ${deadlineCount === 1 ? "deadline needs" : "deadlines need"} attention`,
      colorClass: "border-gold/40 bg-gold/15 text-gold-foreground",
    });
  }

  const typeCounts = new Map<Opportunity["opportunity_type"], number>();
  for (const entry of entries) {
    const type = entry.opportunity.opportunity_type;
    typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
  }
  const topType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topType && entries.length >= 2 && topType[1] / entries.length > 0.5) {
    const label = TYPE_LABELS[topType[0]];
    insights.push({
      icon: Layers,
      label: `Most of your matches are ${label.toLowerCase()}s`,
      colorClass: "border-insight/25 bg-insight/10 text-insight",
    });
  }

  return insights;
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
  const locationLabel = [profile.city, profile.state].filter(Boolean).join(", ") || null;
  const preferenceLabels = onboardingSummary.preferences
    .map((preference) => PREFERENCE_LABELS[preference])
    .filter((label): label is string => Boolean(label));

  const shown = parseShown((await searchParams).shown);
  const supabase = await createClient();
  const [{ data: candidatePool, error: poolError }, savedIds, feedbackProfile, dismissedOpportunityIds] =
    await Promise.all([
      listOpportunitiesForMatching(supabase, profile.grade_level, { studentState: profile.state }),
      getSavedOpportunityIds(supabase, profile.id),
      getFeedbackProfileForUser(supabase, profile.id),
      getDismissedOpportunityIds(supabase, profile.id),
    ]);

  const matchProfileInput = buildMatchProfileInput(profile, onboardingSummary);
  const chosenForYou = buildChosenForYou(candidatePool, matchProfileInput, shown, {
    feedbackProfile,
    dismissedOpportunityIds,
  });

  const chosenSourceIds = [
    ...(chosenForYou.featured ? [chosenForYou.featured.opportunity.source_id] : []),
    ...chosenForYou.additional.map((entry) => entry.opportunity.source_id),
  ].filter((id): id is string => id !== null);
  const chosenOpportunityIds = [
    ...(chosenForYou.featured ? [chosenForYou.featured.opportunity.id] : []),
    ...chosenForYou.additional.map((entry) => entry.opportunity.id),
  ];
  const [chosenSourceNames, feedbackState] = await Promise.all([
    getOpportunitySourceNames(supabase, chosenSourceIds),
    getFeedbackStateForOpportunities(supabase, profile.id, chosenOpportunityIds),
  ]);

  const insights = buildInsights(
    chosenForYou.featured ? [chosenForYou.featured, ...chosenForYou.additional] : chosenForYou.additional
  );

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
          Your personal opportunity advisor prepared today&apos;s matches from your profile below.
        </p>
      </div>

      <section aria-labelledby="foundation-heading" className="animate-fade-up mt-8">
        <h2
          id="foundation-heading"
          className="text-xs font-medium tracking-wide text-primary uppercase"
        >
          Your profile
        </h2>

        <div className="mt-3 rounded-xl border border-border bg-card px-5 py-4">
          <p className="text-sm text-foreground">
            {profile.grade_level ? `Grade ${profile.grade_level}` : "Grade not set"}
            {" · "}
            {weeklyAvailabilityLabel ?? "Availability not set"}
            {" · "}
            {experienceLevelLabel ?? "Experience not set"}
            {profile.guided_mode && " · Guided Mode on"}
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {locationLabel && <AccentChip variant="primary">{locationLabel}</AccentChip>}
            {interestChips.map((interest) => (
              <AccentChip key={interest} variant="insight">
                {interest}
              </AccentChip>
            ))}
            {preferenceLabels.map((label) => (
              <Chip key={label} size="sm">
                {label}
              </Chip>
            ))}
          </div>

          {goals.length > 0 && (
            <div className="mt-3 border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground">Current goals</p>
              <div className="mt-1.5">
                <ChipList items={goals} emptyLabel="Not set" />
              </div>
            </div>
          )}
        </div>
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
                  feedbackState={toFeedbackState(feedbackState.get(chosenForYou.featured.opportunity.id))}
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
                      showWhyItFits
                      feedbackState={toFeedbackState(feedbackState.get(entry.opportunity.id))}
                      sourceName={
                        entry.opportunity.source_id
                          ? (chosenSourceNames.get(entry.opportunity.source_id) ?? null)
                          : null
                      }
                    />
                  ))}
                </div>
              )}

              {insights.length > 0 && (
                <ul className="flex flex-wrap gap-2" aria-label="Insights about your matches">
                  {insights.map((insight) => (
                    <li
                      key={insight.label}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${insight.colorClass}`}
                    >
                      <insight.icon aria-hidden="true" className="size-3.5" />
                      {insight.label}
                    </li>
                  ))}
                </ul>
              )}

              {chosenForYou.status === "exhausted" && <DiscoverMore />}

              {chosenForYou.status === "only_broader_remaining" && chosenForYou.nextShown !== null && (
                <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-secondary px-5 py-4">
                  <p role="status" className="text-sm text-muted-foreground">
                    I found a few more, but they are not as closely matched to your interests and
                    preferences.
                  </p>
                  <FindMoreButton nextShown={chosenForYou.nextShown} />
                </div>
              )}

              {chosenForYou.status === "has_more" && chosenForYou.nextShown !== null && (
                <div className="flex flex-col items-start gap-3 rounded-xl border border-primary/20 bg-[color-mix(in_oklch,var(--primary),transparent_95%)] px-5 py-4">
                  <p className="text-sm text-foreground">Want to see a few more matches?</p>
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

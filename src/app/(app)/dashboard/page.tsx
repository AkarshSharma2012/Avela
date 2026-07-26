import type { Metadata } from "next";
import Link from "next/link";
import { Bookmark, Compass } from "lucide-react";

import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { NodeTrack, type TrackNode } from "@/components/ui/node-track";
import { requireProfile } from "@/lib/auth/dal";
import { getOnboardingSummary } from "@/lib/onboarding/dal";
import {
  EXPERIENCE_LEVEL_OPTIONS,
  WEEKLY_AVAILABILITY_OPTIONS,
} from "@/lib/onboarding/constants";
import { getFirstName } from "@/lib/profile/display";

export const metadata: Metadata = {
  title: "Dashboard — Avela",
};

const JOURNEY: TrackNode[] = [
  { key: "profile", label: "Profile complete", state: "done" },
  { key: "personalization", label: "Personalization ready", state: "done" },
  { key: "opportunities", label: "Opportunities coming next", state: "upcoming" },
];

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

export default async function DashboardPage() {
  const profile = await requireProfile();
  const firstName = getFirstName(profile);
  const { interests, otherInterestText, goals } = await getOnboardingSummary(profile.id);

  const interestChips = interests.map((interest) =>
    interest === "Other" && otherInterestText ? `Other (${otherInterestText})` : interest
  );
  const weeklyAvailabilityLabel = WEEKLY_AVAILABILITY_OPTIONS.find(
    (option) => option.value === profile.weekly_availability
  )?.label;
  const experienceLevelLabel = EXPERIENCE_LEVEL_OPTIONS.find(
    (option) => option.value === profile.experience_level
  )?.label;

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
          Opportunity discovery
        </h2>
        <div className="mt-4">
          <EmptyState
            icon={Compass}
            title="Your opportunities will appear here once discovery is enabled."
            description="Your profile is ready for matching."
            action={{ label: "Preview the Opportunities page", href: "/opportunities" }}
          />
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
        Next step: check{" "}
        <Link href="/opportunities" className="text-primary underline-offset-4 hover:underline">
          Opportunities
        </Link>{" "}
        again once discovery is enabled — your profile is already set up for matching.
      </p>
    </div>
  );
}

import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { LogoutButton } from "@/components/auth/logout-button";
import { PathMotif } from "@/components/brand/path-motif";
import { Chip } from "@/components/ui/chip";
import { NodeTrack, type TrackNode } from "@/components/ui/node-track";
import { requireProfile } from "@/lib/auth/dal";
import { getOnboardingSummary } from "@/lib/onboarding/dal";
import {
  EXPERIENCE_LEVEL_OPTIONS,
  WEEKLY_AVAILABILITY_OPTIONS,
} from "@/lib/onboarding/constants";

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
    return <span className="text-base text-text-secondary">{emptyLabel}</span>;
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

  if (!profile.onboarding_completed) {
    redirect("/onboarding");
  }

  const displayName = profile.display_name?.trim() || profile.email;
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
    <div className="mx-auto flex min-h-svh w-full max-w-4xl flex-col overflow-x-hidden px-6 py-12">
      <header className="animate-fade-up flex items-center justify-between border-b border-border pb-6">
        <span className="font-heading text-lg font-semibold text-foreground">
          Avela
        </span>
        <LogoutButton />
      </header>

      <main className="stagger-children flex flex-1 flex-col py-12">
        <div className="animate-fade-up">
          <p className="mb-3 text-xs font-medium tracking-wide text-primary uppercase">
            Dashboard
          </p>
          <h1 className="font-heading text-3xl break-words text-foreground sm:text-4xl">
            Welcome, {displayName}.
          </h1>
          <p className="mt-4 max-w-lg font-heading text-base leading-relaxed text-text-secondary italic">
            Here&apos;s what we know about you so far.
          </p>
        </div>

        <div className="animate-fade-up relative mt-10 overflow-hidden rounded-md border border-primary/20 bg-[color-mix(in_oklch,var(--primary),transparent_95%)] px-6 py-6">
          <p className="text-xs font-medium tracking-wide text-primary uppercase">
            Milestone 2 complete
          </p>
          <p className="mt-1 font-heading text-xl text-foreground">Your foundation is ready.</p>

          <div className="mt-5">
            <NodeTrack nodes={JOURNEY} size="md" hideConnectorBelowSm />
          </div>
        </div>

        <dl className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="animate-fade-up rounded-md border border-border bg-card px-5 py-4">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Grade level
            </dt>
            <dd className="mt-1 text-base text-foreground">
              {profile.grade_level ? `Grade ${profile.grade_level}` : "Not set"}
            </dd>
          </div>

          <div className="animate-fade-up rounded-md border border-border bg-card px-5 py-4">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Guided Mode
            </dt>
            <dd className="mt-1 text-base text-foreground">
              {profile.guided_mode ? "On" : "Off"}
            </dd>
          </div>

          <div className="animate-fade-up rounded-md border border-border bg-card px-5 py-4">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Weekly availability
            </dt>
            <dd className="mt-1 text-base text-foreground">
              {weeklyAvailabilityLabel ?? "Not set"}
            </dd>
          </div>

          <div className="animate-fade-up rounded-md border border-border bg-card px-5 py-4">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Experience level
            </dt>
            <dd className="mt-1 text-base text-foreground">
              {experienceLevelLabel ?? "Not set"}
            </dd>
          </div>

          <div className="animate-fade-up rounded-md border border-border bg-card px-5 py-4 sm:col-span-2">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Interests
            </dt>
            <dd className="mt-2">
              <ChipList items={interestChips} emptyLabel="Not set" />
            </dd>
          </div>

          <div className="animate-fade-up rounded-md border border-border bg-card px-5 py-4 sm:col-span-2">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Current goals
            </dt>
            <dd className="mt-2">
              <ChipList items={goals} emptyLabel="Not set" />
            </dd>
          </div>
        </dl>

        <div className="animate-fade-up relative mt-6 overflow-hidden rounded-md border border-dashed border-border bg-secondary px-6 py-8">
          <PathMotif className="right-2 -bottom-6 h-32 w-28 opacity-70" />
          <p className="relative text-sm font-medium text-foreground">
            Personalized opportunities are on the way
          </p>
          <p className="relative mt-1 max-w-md text-sm text-muted-foreground">
            Matching you to opportunities, goals, and achievements based on
            what you told us arrives in Milestone 3 and beyond.
          </p>
        </div>
      </main>
    </div>
  );
}

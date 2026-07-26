import type { Metadata } from "next";

import { Chip } from "@/components/ui/chip";
import { requireProfile } from "@/lib/auth/dal";
import { getOnboardingSummary } from "@/lib/onboarding/dal";
import {
  EXPERIENCE_LEVEL_OPTIONS,
  WEEKLY_AVAILABILITY_OPTIONS,
} from "@/lib/onboarding/constants";
import { describePreferences } from "@/lib/onboarding/preferences";
import { getDisplayName } from "@/lib/profile/display";

export const metadata: Metadata = {
  title: "Profile — Avela",
};

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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-5 py-4">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-base text-foreground">{value}</dd>
    </div>
  );
}

export default async function ProfilePage() {
  const profile = await requireProfile();
  const { interests, otherInterestText, goals, preferences } = await getOnboardingSummary(
    profile.id
  );

  const interestChips = interests.map((interest) =>
    interest === "Other" && otherInterestText ? `Other (${otherInterestText})` : interest
  );
  const preferenceChips = describePreferences(preferences).map(
    (preference) => `${preference.groupLabel}: ${preference.optionLabel}`
  );
  const weeklyAvailabilityLabel = WEEKLY_AVAILABILITY_OPTIONS.find(
    (option) => option.value === profile.weekly_availability
  )?.label;
  const experienceLevelLabel = EXPERIENCE_LEVEL_OPTIONS.find(
    (option) => option.value === profile.experience_level
  )?.label;
  const location = [profile.city, profile.state].filter(Boolean).join(", ") || null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col px-6 py-10 sm:py-12">
      <div className="stagger-children">
        <p className="animate-fade-up mb-3 text-xs font-medium tracking-wide text-primary uppercase">
          Profile
        </p>
        <h1 className="animate-fade-up font-heading text-3xl text-foreground sm:text-4xl">
          {getDisplayName(profile)}
        </h1>
        <p className="animate-fade-up mt-3 max-w-lg text-base leading-relaxed text-text-secondary">
          Everything below came from onboarding. Editing your answers isn&apos;t available yet —
          that&apos;s on the way in a future milestone.
        </p>
      </div>

      <section aria-labelledby="basic-info-heading" className="animate-fade-up mt-10">
        <h2
          id="basic-info-heading"
          className="text-xs font-medium tracking-wide text-primary uppercase"
        >
          Basic information
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Grade level" value={profile.grade_level ? `Grade ${profile.grade_level}` : "Not set"} />
          <Field label="Location" value={location ?? profile.country} />
        </dl>
      </section>

      <section aria-labelledby="interests-heading" className="animate-fade-up mt-8">
        <h2
          id="interests-heading"
          className="text-xs font-medium tracking-wide text-primary uppercase"
        >
          Interests
        </h2>
        <div className="mt-4 rounded-md border border-border bg-card px-5 py-4">
          <ChipList items={interestChips} emptyLabel="Not set" />
        </div>
      </section>

      <section aria-labelledby="goals-heading" className="animate-fade-up mt-8">
        <h2
          id="goals-heading"
          className="text-xs font-medium tracking-wide text-primary uppercase"
        >
          Goals
        </h2>
        <div className="mt-4 rounded-md border border-border bg-card px-5 py-4">
          <ChipList items={goals} emptyLabel="Not set" />
        </div>
      </section>

      <section aria-labelledby="preferences-heading" className="animate-fade-up mt-8">
        <h2
          id="preferences-heading"
          className="text-xs font-medium tracking-wide text-primary uppercase"
        >
          Opportunity preferences
        </h2>
        <div className="mt-4 rounded-md border border-border bg-card px-5 py-4">
          <ChipList items={preferenceChips} emptyLabel="Not set" />
        </div>
      </section>

      <section aria-labelledby="availability-heading" className="animate-fade-up mt-8">
        <h2
          id="availability-heading"
          className="text-xs font-medium tracking-wide text-primary uppercase"
        >
          Availability and experience
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Weekly availability" value={weeklyAvailabilityLabel ?? "Not set"} />
          <Field label="Experience level" value={experienceLevelLabel ?? "Not set"} />
          <Field label="Guided Mode" value={profile.guided_mode ? "On" : "Off"} />
        </dl>
      </section>
    </div>
  );
}

"use client";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  EXPERIENCE_LEVEL_OPTIONS,
  PREFERENCE_GROUPS,
  WEEKLY_AVAILABILITY_OPTIONS,
} from "@/lib/onboarding/constants";
import type { OnboardingDraft } from "@/lib/onboarding/draft";

function StepReview({
  draft,
  onEditStep,
}: {
  draft: OnboardingDraft;
  onEditStep: (step: number) => void;
}) {
  const weeklyAvailabilityLabel = WEEKLY_AVAILABILITY_OPTIONS.find(
    (option) => option.value === draft.weeklyAvailability
  )?.label;
  const experienceLevelLabel = EXPERIENCE_LEVEL_OPTIONS.find(
    (option) => option.value === draft.experienceLevel
  )?.label;
  const preferenceLabels = PREFERENCE_GROUPS.flatMap((group) => group.options)
    .filter((option) => draft.preferences.includes(option.value))
    .map((option) => option.label);

  const location = [draft.city, draft.state, draft.country]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(", ");

  const interestChips =
    draft.interests.length > 0
      ? draft.interests.map((interest) =>
          interest === "Other" && draft.otherInterestText.trim().length > 0
            ? `Other (${draft.otherInterestText.trim()})`
            : interest
        )
      : [];

  const sections: {
    step: number;
    title: string;
    rows?: [string, string][];
    chips?: string[];
    emptyLabel?: string;
  }[] = [
    {
      step: 0,
      title: "Basic information",
      rows: [
        ["Preferred name", draft.preferredName || "—"],
        ["Grade level", draft.gradeLevel ? `Grade ${draft.gradeLevel}` : "—"],
        ["Location", location || "—"],
      ],
    },
    {
      step: 1,
      title: "Interests",
      chips: interestChips,
      emptyLabel: "—",
    },
    {
      step: 2,
      title: "Current goals",
      chips: draft.goals,
      emptyLabel: "—",
    },
    {
      step: 3,
      title: "Opportunity preferences",
      chips: preferenceLabels,
      emptyLabel: "No preference set",
    },
    {
      step: 4,
      title: "Availability and experience",
      rows: [
        ["Weekly availability", weeklyAvailabilityLabel ?? "—"],
        ["Experience level", experienceLevelLabel ?? "—"],
        ["Guided Mode", draft.guidedMode ? "On" : "Off"],
      ],
    },
  ];

  return (
    <div className="stagger-children flex flex-col gap-6">
      <div className="animate-fade-up">
        <h2 className="font-heading text-2xl text-foreground">Review and complete</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Take a look before you finish. You can edit any section below.
        </p>
      </div>

      <div className="animate-fade-up flex flex-col divide-y divide-border rounded-md border border-border">
        {sections.map((section) => (
          <div
            key={section.title}
            className="group flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{section.title}</p>
              {section.rows && (
                <dl className="mt-2 flex flex-col gap-1">
                  {section.rows.map(([label, value]) => (
                    <div key={label} className="text-sm text-text-secondary">
                      <span className="text-muted-foreground">{label}: </span>
                      <span className="break-words">{value}</span>
                    </div>
                  ))}
                </dl>
              )}
              {section.chips &&
                (section.chips.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {section.chips.map((chip) => (
                      <Chip key={chip} size="sm">
                        {chip}
                      </Chip>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-text-secondary">{section.emptyLabel}</p>
                ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start opacity-80 transition-opacity group-hover:opacity-100"
              onClick={() => onEditStep(section.step)}
            >
              Edit
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export { StepReview };

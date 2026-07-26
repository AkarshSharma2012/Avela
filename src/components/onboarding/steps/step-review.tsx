"use client";

import { Button } from "@/components/ui/button";
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

  const interestSummary =
    draft.interests.length > 0
      ? draft.interests
          .map((interest) =>
            interest === "Other" && draft.otherInterestText.trim().length > 0
              ? `Other (${draft.otherInterestText.trim()})`
              : interest
          )
          .join(", ")
      : "—";

  const sections: { step: number; title: string; rows: [string, string][] }[] = [
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
      rows: [["Selected", interestSummary]],
    },
    {
      step: 2,
      title: "Current goals",
      rows: [["Selected", draft.goals.length > 0 ? draft.goals.join(", ") : "—"]],
    },
    {
      step: 3,
      title: "Opportunity preferences",
      rows: [
        [
          "Selected",
          preferenceLabels.length > 0 ? preferenceLabels.join(", ") : "No preference set",
        ],
      ],
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
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-heading text-2xl text-foreground">Review and complete</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Take a look before you finish. You can edit any section below.
        </p>
      </div>

      <div className="flex flex-col divide-y divide-border rounded-md border border-border">
        {sections.map((section) => (
          <div
            key={section.title}
            className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{section.title}</p>
              <dl className="mt-2 flex flex-col gap-1">
                {section.rows.map(([label, value]) => (
                  <div key={label} className="text-sm text-text-secondary">
                    <span className="text-muted-foreground">{label}: </span>
                    <span className="break-words">{value}</span>
                  </div>
                ))}
              </dl>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
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

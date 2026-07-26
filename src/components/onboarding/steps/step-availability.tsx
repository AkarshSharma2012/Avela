"use client";

import { FieldError } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import {
  EXPERIENCE_LEVEL_OPTIONS,
  WEEKLY_AVAILABILITY_OPTIONS,
} from "@/lib/onboarding/constants";
import type { OnboardingDraft } from "@/lib/onboarding/draft";

function StepAvailability({
  draft,
  errors,
  onChange,
}: {
  draft: OnboardingDraft;
  errors: Record<string, string>;
  onChange: (patch: Partial<OnboardingDraft>) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-heading text-2xl text-foreground">
          Availability and experience
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          This helps us suggest opportunities that actually fit your schedule.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label id="weeklyAvailability-label">Weekly time availability</Label>
        <RadioGroup
          aria-labelledby="weeklyAvailability-label"
          value={draft.weeklyAvailability}
          onValueChange={(value) =>
            onChange({ weeklyAvailability: value as OnboardingDraft["weeklyAvailability"] })
          }
        >
          {WEEKLY_AVAILABILITY_OPTIONS.map((option) => (
            <RadioGroupItem key={option.value} value={option.value}>
              {option.label}
            </RadioGroupItem>
          ))}
        </RadioGroup>
        <FieldError
          errors={errors.weeklyAvailability ? [errors.weeklyAvailability] : undefined}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label id="experienceLevel-label">Current experience level</Label>
        <RadioGroup
          aria-labelledby="experienceLevel-label"
          value={draft.experienceLevel}
          onValueChange={(value) =>
            onChange({ experienceLevel: value as OnboardingDraft["experienceLevel"] })
          }
        >
          {EXPERIENCE_LEVEL_OPTIONS.map((option) => (
            <RadioGroupItem key={option.value} value={option.value}>
              {option.label}
            </RadioGroupItem>
          ))}
        </RadioGroup>
        <FieldError
          errors={errors.experienceLevel ? [errors.experienceLevel] : undefined}
        />
      </div>

      <div className="flex items-start justify-between gap-4 rounded-md border border-border bg-secondary px-4 py-4">
        <div>
          <Label htmlFor="guidedMode">Guided Mode</Label>
          <p className="mt-1 max-w-sm text-sm text-text-secondary">
            Guided Mode uses simpler language, fewer choices shown at once, and
            more step-by-step support. You can turn it on or off any time.
          </p>
        </div>
        <Switch
          id="guidedMode"
          checked={draft.guidedMode}
          onCheckedChange={(checked) => onChange({ guidedMode: checked })}
        />
      </div>
    </div>
  );
}

export { StepAvailability };

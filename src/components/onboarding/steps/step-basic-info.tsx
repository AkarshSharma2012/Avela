"use client";

import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { GRADE_LEVELS, UNITED_STATES } from "@/lib/onboarding/constants";
import type { OnboardingDraft } from "@/lib/onboarding/draft";

function StepBasicInfo({
  draft,
  errors,
  onChange,
}: {
  draft: OnboardingDraft;
  errors: Record<string, string>;
  onChange: (patch: Partial<OnboardingDraft>) => void;
}) {
  const isUnitedStates =
    draft.country.trim().toLowerCase() === UNITED_STATES.toLowerCase();

  return (
    <div className="stagger-children flex flex-col gap-6">
      <div className="animate-fade-up">
        <h2 className="font-heading text-2xl text-foreground">Basic information</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Tell us a little about yourself so we can start personalizing Avela.
        </p>
      </div>

      <div className="animate-fade-up flex flex-col gap-2">
        <Label htmlFor="preferredName">Preferred name</Label>
        <Input
          id="preferredName"
          value={draft.preferredName}
          onChange={(event) => onChange({ preferredName: event.target.value })}
          autoComplete="given-name"
          aria-invalid={Boolean(errors.preferredName)}
          aria-describedby={errors.preferredName ? "preferredName-error" : undefined}
        />
        <FieldError
          id="preferredName-error"
          errors={errors.preferredName ? [errors.preferredName] : undefined}
        />
      </div>

      <div className="animate-fade-up flex flex-col gap-2">
        <Label id="gradeLevel-label">Grade level</Label>
        <RadioGroup
          aria-labelledby="gradeLevel-label"
          value={draft.gradeLevel}
          onValueChange={(value) => onChange({ gradeLevel: value as number })}
        >
          {GRADE_LEVELS.map((grade) => (
            <RadioGroupItem key={grade} value={grade}>
              Grade {grade}
            </RadioGroupItem>
          ))}
        </RadioGroup>
        <FieldError errors={errors.gradeLevel ? [errors.gradeLevel] : undefined} />
      </div>

      <div className="animate-fade-up flex flex-col gap-2">
        <Label htmlFor="country">Country</Label>
        <Input
          id="country"
          value={draft.country}
          onChange={(event) => onChange({ country: event.target.value })}
          autoComplete="country-name"
          aria-invalid={Boolean(errors.country)}
          aria-describedby={errors.country ? "country-error" : undefined}
        />
        <FieldError id="country-error" errors={errors.country ? [errors.country] : undefined} />
      </div>

      <div className="animate-fade-up grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="city">
            City
            {!isUnitedStates && (
              <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
            )}
          </Label>
          <Input
            id="city"
            value={draft.city}
            onChange={(event) => onChange({ city: event.target.value })}
            autoComplete="address-level2"
            aria-invalid={Boolean(errors.city)}
            aria-describedby={errors.city ? "city-error" : undefined}
          />
          <FieldError id="city-error" errors={errors.city ? [errors.city] : undefined} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="state">
            State
            {!isUnitedStates && (
              <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
            )}
          </Label>
          <Input
            id="state"
            value={draft.state}
            onChange={(event) => onChange({ state: event.target.value })}
            autoComplete="address-level1"
            aria-invalid={Boolean(errors.state)}
            aria-describedby={errors.state ? "state-error" : undefined}
          />
          <FieldError id="state-error" errors={errors.state ? [errors.state] : undefined} />
        </div>
      </div>
    </div>
  );
}

export { StepBasicInfo };

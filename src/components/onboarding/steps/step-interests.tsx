"use client";

import { useState } from "react";

import { OptionCheckbox } from "@/components/onboarding/option-checkbox";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { INTEREST_CATEGORIES, INTEREST_FALLBACKS } from "@/lib/onboarding/constants";
import type { OnboardingDraft } from "@/lib/onboarding/draft";
import type { InterestValue } from "@/types/database";

const GUIDED_VISIBLE_COUNT = 8;

function StepInterests({
  draft,
  errors,
  onChange,
}: {
  draft: OnboardingDraft;
  errors: Record<string, string>;
  onChange: (patch: Partial<OnboardingDraft>) => void;
}) {
  const [showAll, setShowAll] = useState(!draft.guidedMode);

  function toggleInterest(interest: InterestValue, checked: boolean) {
    const next = checked
      ? [...draft.interests, interest]
      : draft.interests.filter((value) => value !== interest);
    onChange({ interests: next });
  }

  const visibleCategories = showAll
    ? INTEREST_CATEGORIES
    : INTEREST_CATEGORIES.slice(0, GUIDED_VISIBLE_COUNT);

  return (
    <div className="stagger-children flex flex-col gap-6">
      <div className="animate-fade-up">
        <h2 id="interests-heading" className="font-heading text-2xl text-foreground">
          What are you interested in?
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          {draft.guidedMode
            ? "Pick anything that sounds interesting. It's okay to choose just one."
            : "Select as many as you like. It's completely fine to not have this figured out yet."}
        </p>
      </div>

      <div
        role="group"
        aria-labelledby="interests-heading"
        className="animate-fade-up grid grid-cols-1 gap-2.5 sm:grid-cols-2"
      >
        {visibleCategories.map((interest) => (
          <OptionCheckbox
            key={interest}
            id={`interest-${interest}`}
            label={interest}
            checked={draft.interests.includes(interest)}
            onCheckedChange={(checked) => toggleInterest(interest, checked)}
          />
        ))}
      </div>

      {!showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="self-start text-sm font-medium text-primary hover:underline"
        >
          Show all options
        </button>
      )}

      <div className="animate-fade-up flex flex-col gap-3 border-t border-border pt-5">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {INTEREST_FALLBACKS.map((interest) => (
            <OptionCheckbox
              key={interest}
              id={`interest-${interest}`}
              label={interest}
              checked={draft.interests.includes(interest)}
              onCheckedChange={(checked) => toggleInterest(interest, checked)}
            />
          ))}
        </div>

        {draft.interests.includes("Other") && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="otherInterestText">Tell us more</Label>
            <Input
              id="otherInterestText"
              value={draft.otherInterestText}
              onChange={(event) => onChange({ otherInterestText: event.target.value })}
              placeholder="What else are you interested in?"
              aria-invalid={Boolean(errors.otherInterestText)}
            />
            <FieldError
              errors={errors.otherInterestText ? [errors.otherInterestText] : undefined}
            />
          </div>
        )}
      </div>

      <FieldError errors={errors.interests ? [errors.interests] : undefined} />
    </div>
  );
}

export { StepInterests };

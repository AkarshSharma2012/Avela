"use client";

import { OptionCheckbox } from "@/components/onboarding/option-checkbox";
import { PREFERENCE_GROUPS } from "@/lib/onboarding/constants";
import type { OnboardingDraft } from "@/lib/onboarding/draft";
import type { OpportunityPreferenceKey } from "@/types/database";

function StepPreferences({
  draft,
  onChange,
}: {
  draft: OnboardingDraft;
  errors: Record<string, string>;
  onChange: (patch: Partial<OnboardingDraft>) => void;
}) {
  function togglePreference(key: OpportunityPreferenceKey, checked: boolean) {
    const next = checked
      ? [...draft.preferences, key]
      : draft.preferences.filter((value) => value !== key);
    onChange({ preferences: next });
  }

  return (
    <div className="stagger-children flex flex-col gap-6">
      <div className="animate-fade-up">
        <h2 className="font-heading text-2xl text-foreground">
          Opportunity preferences
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          Optional — tell us what kinds of opportunities you&apos;d prefer. You
          can change this later.
        </p>
      </div>

      {PREFERENCE_GROUPS.map((group) => (
        <div key={group.id} className="animate-fade-up flex flex-col gap-2.5">
          <div>
            <p id={`pref-${group.id}-label`} className="text-sm font-medium text-foreground">
              {group.label}
            </p>
            <p className="text-xs text-muted-foreground">{group.description}</p>
          </div>
          <div
            role="group"
            aria-labelledby={`pref-${group.id}-label`}
            className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
          >
            {group.options.map((option) => (
              <OptionCheckbox
                key={option.value}
                id={`pref-${option.value}`}
                label={option.label}
                checked={draft.preferences.includes(option.value)}
                onCheckedChange={(checked) => togglePreference(option.value, checked)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export { StepPreferences };

"use client";

import { OptionCheckbox } from "@/components/onboarding/option-checkbox";
import { FieldError } from "@/components/ui/field-error";
import { GOALS } from "@/lib/onboarding/constants";
import type { OnboardingDraft } from "@/lib/onboarding/draft";
import type { GoalValue } from "@/types/database";

function StepGoals({
  draft,
  errors,
  onChange,
}: {
  draft: OnboardingDraft;
  errors: Record<string, string>;
  onChange: (patch: Partial<OnboardingDraft>) => void;
}) {
  function toggleGoal(goal: GoalValue, checked: boolean) {
    const next = checked
      ? [...draft.goals, goal]
      : draft.goals.filter((value) => value !== goal);
    onChange({ goals: next });
  }

  return (
    <div className="stagger-children flex flex-col gap-6">
      <div className="animate-fade-up">
        <h2 id="goals-heading" className="font-heading text-2xl text-foreground">
          What are you hoping to do right now?
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          Select everything that applies — this helps us know what to show you
          first.
        </p>
      </div>

      <div
        role="group"
        aria-labelledby="goals-heading"
        className="animate-fade-up grid grid-cols-1 gap-2.5 sm:grid-cols-2"
      >
        {GOALS.map((goal) => (
          <OptionCheckbox
            key={goal}
            id={`goal-${goal}`}
            label={goal}
            checked={draft.goals.includes(goal)}
            onCheckedChange={(checked) => toggleGoal(goal, checked)}
          />
        ))}
      </div>

      <FieldError errors={errors.goals ? [errors.goals] : undefined} />
    </div>
  );
}

export { StepGoals };

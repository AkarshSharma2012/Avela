"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { ProgressIndicator } from "@/components/onboarding/progress-indicator";
import { StepAvailability } from "@/components/onboarding/steps/step-availability";
import { StepBasicInfo } from "@/components/onboarding/steps/step-basic-info";
import { StepGoals } from "@/components/onboarding/steps/step-goals";
import { StepInterests } from "@/components/onboarding/steps/step-interests";
import { StepPreferences } from "@/components/onboarding/steps/step-preferences";
import { StepReview } from "@/components/onboarding/steps/step-review";
import { submitOnboarding, type SubmitOnboardingState } from "@/lib/onboarding/actions";
import { TOTAL_STEPS } from "@/lib/onboarding/constants";
import { draftToFormEntries, EMPTY_DRAFT, type OnboardingDraft } from "@/lib/onboarding/draft";
import {
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  step5Schema,
} from "@/lib/onboarding/schema";
import { clearDraft, loadDraft, saveDraft } from "@/lib/onboarding/storage";

const STEP_SCHEMAS = [
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  step5Schema,
] as const;

const INITIAL_ACTION_STATE: SubmitOnboardingState = {};

function flattenErrors(error: {
  flatten: () => { fieldErrors: Record<string, string[] | undefined> };
}): Record<string, string> {
  const { fieldErrors } = error.flatten();
  const result: Record<string, string> = {};
  for (const [key, messages] of Object.entries(fieldErrors)) {
    if (messages && messages.length > 0) {
      result[key] = messages[0];
    }
  }
  return result;
}

function OnboardingWizard() {
  const router = useRouter();
  const [draft, setDraft] = useState<OnboardingDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);
  const [actionState, formAction, pending] = useActionState(
    submitOnboarding,
    INITIAL_ACTION_STATE
  );

  // Read the saved draft only after mount so the server-rendered markup and
  // the client's first paint match exactly (no hydration mismatch). This is
  // the one-time "adopt state from an external, client-only store" case the
  // set-state-in-effect rule doesn't have a subscription-based alternative
  // for, so it's disabled here rather than restructured.
  useEffect(() => {
    const saved = loadDraft();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setDraft(saved);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveDraft(draft);
  }, [draft, hydrated]);

  useEffect(() => {
    if (!actionState.success) return;
    clearDraft();
    router.replace("/dashboard");
  }, [actionState.success, router]);

  function updateDraft(patch: Partial<OnboardingDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function goToStep(step: number) {
    setErrors({});
    setDraft((current) => ({ ...current, step }));
  }

  function handleBack() {
    goToStep(Math.max(0, draft.step - 1));
  }

  function handleContinue() {
    const schema = STEP_SCHEMAS[draft.step];
    const result = schema.safeParse(draft);
    if (!result.success) {
      setErrors(flattenErrors(result.error));
      return;
    }
    goToStep(Math.min(TOTAL_STEPS - 1, draft.step + 1));
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading your progress…</p>
      </div>
    );
  }

  const isLastStep = draft.step === TOTAL_STEPS - 1;

  return (
    <div>
      <ProgressIndicator currentStep={draft.step} />

      {actionState.error && (
        <FormMessage variant="error" className="mb-6">
          {actionState.error}
        </FormMessage>
      )}

      {draft.step === 0 && (
        <StepBasicInfo draft={draft} errors={errors} onChange={updateDraft} />
      )}
      {draft.step === 1 && (
        <StepInterests draft={draft} errors={errors} onChange={updateDraft} />
      )}
      {draft.step === 2 && (
        <StepGoals draft={draft} errors={errors} onChange={updateDraft} />
      )}
      {draft.step === 3 && (
        <StepPreferences draft={draft} errors={errors} onChange={updateDraft} />
      )}
      {draft.step === 4 && (
        <StepAvailability draft={draft} errors={errors} onChange={updateDraft} />
      )}
      {draft.step === 5 && <StepReview draft={draft} onEditStep={goToStep} />}

      <div className="mt-10 flex items-center justify-between border-t border-border pt-6">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={handleBack}
          disabled={draft.step === 0 || pending}
        >
          Back
        </Button>

        {isLastStep ? (
          <form action={formAction}>
            {draftToFormEntries(draft).map((entry, index) => (
              <input
                key={`${entry.name}-${index}`}
                type="hidden"
                name={entry.name}
                value={entry.value}
              />
            ))}
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Saving…" : "Complete onboarding"}
            </Button>
          </form>
        ) : (
          <Button type="button" size="lg" onClick={handleContinue} disabled={pending}>
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}

export { OnboardingWizard };

"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Spinner } from "@/components/ui/spinner";
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
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [actionState, formAction, pending] = useActionState(
    submitOnboarding,
    INITIAL_ACTION_STATE
  );
  const completing = actionState.success ?? false;
  const formEntries = useMemo(() => draftToFormEntries(draft), [draft]);

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
    const timer = setTimeout(() => router.replace("/dashboard"), 850);
    return () => clearTimeout(timer);
  }, [actionState.success, router]);

  function updateDraft(patch: Partial<OnboardingDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function goToStep(step: number) {
    setErrors({});
    setDirection(step >= draft.step ? "forward" : "back");
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

  if (completing) {
    return (
      <div className="animate-in fade-in flex min-h-[24rem] flex-col items-center justify-center gap-4 text-center duration-300">
        <div className="animate-dot-pop flex size-16 items-center justify-center rounded-full bg-primary/10">
          <svg viewBox="0 0 24 24" className="size-8 text-primary" fill="none">
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="1.5"
              opacity="0.25"
            />
            <path
              d="M7 12.5l3 3 7-7.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-check-draw"
            />
          </svg>
        </div>
        <div className="animate-fade-up" style={{ animationDelay: "150ms" }}>
          <p className="font-heading text-xl text-foreground">You&apos;re all set.</p>
          <p className="mt-1 text-sm text-text-secondary">
            Taking you to your dashboard…
          </p>
        </div>
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

      <div
        key={draft.step}
        className={cn(
          "animate-in fade-in duration-[var(--duration-page)] ease-[var(--ease-standard)]",
          direction === "forward" ? "slide-in-from-right-8" : "slide-in-from-left-8"
        )}
      >
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
      </div>

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
            {formEntries.map((entry, index) => (
              <input
                key={`${entry.name}-${index}`}
                type="hidden"
                name={entry.name}
                value={entry.value}
              />
            ))}
            <Button
              type="submit"
              size="lg"
              disabled={pending}
              className="gap-2 shadow-[var(--shadow-gold)]"
            >
              {pending && <Spinner />}
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

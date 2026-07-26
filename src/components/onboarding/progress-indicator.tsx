import { STEP_TITLES, TOTAL_STEPS } from "@/lib/onboarding/constants";

function ProgressIndicator({ currentStep }: { currentStep: number }) {
  const percent = Math.round(((currentStep + 1) / TOTAL_STEPS) * 100);

  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center justify-between gap-4 text-xs font-medium text-muted-foreground">
        <span className="shrink-0">
          Step {currentStep + 1} of {TOTAL_STEPS}
        </span>
        <span className="min-w-0 truncate text-right">{STEP_TITLES[currentStep]}</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Onboarding progress"
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export { ProgressIndicator };

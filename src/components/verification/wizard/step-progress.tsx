import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { TOTAL_STEPS, type WizardStep } from "@/components/verification/wizard/types";

const STEP_LABELS: Record<WizardStep, string> = {
  1: "Choose",
  2: "Add details",
  3: "Review",
  4: "Result",
};

/** Numbered progress dots (spec: "progress dots or numbered steps", never an autoplay carousel) — purely presentational, aria-current marks the live step for assistive tech. */
function StepProgress({ step }: { step: WizardStep }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Step {step} of {TOTAL_STEPS}
      </p>
      <ol className="flex items-center gap-2">
        {([1, 2, 3, 4] as const).map((value) => {
          const isCurrent = value === step;
          const isDone = value < step;
          return (
            <li key={value} className="flex flex-1 items-center gap-2">
              <span
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors duration-[var(--duration-fast)]",
                  isCurrent && "border-primary bg-primary text-primary-foreground shadow-sm",
                  isDone && !isCurrent && "border-primary/40 bg-primary/10 text-primary",
                  !isCurrent && !isDone && "border-border bg-secondary text-muted-foreground"
                )}
              >
                {isDone ? <Check aria-hidden="true" className="size-3.5" /> : value}
              </span>
              <span className={cn("hidden text-xs sm:inline", isCurrent ? "font-medium text-foreground" : "text-muted-foreground")}>
                {STEP_LABELS[value]}
              </span>
              {value < TOTAL_STEPS && <span aria-hidden="true" className={cn("h-px flex-1", isDone ? "bg-primary/40" : "bg-border")} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export { StepProgress };

import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const TONE_CLASSES = {
  primary: "text-primary",
  success: "text-success",
} as const;

/**
 * The bare circular sweep, extracted from the dashboard's original
 * standalone ProgressGauge card so ProgressOverviewPanel can compose two of
 * these as rows inside one shared surface (spec section 2) instead of two
 * separate cards. Pure CSS keyframe animation — see globals.css's
 * gauge-fill — so it needs no client JS and collapses under
 * prefers-reduced-motion automatically.
 */
function ProgressRing({ percent, tone = "primary", className }: { percent: number; tone?: keyof typeof TONE_CLASSES; className?: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const offset = CIRCUMFERENCE * (1 - clamped / 100);

  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={cn("shrink-0 -rotate-90", className)}>
      <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="9" className="stroke-secondary" />
      <circle
        cx="50"
        cy="50"
        r={RADIUS}
        fill="none"
        strokeWidth="9"
        strokeLinecap="round"
        className={cn("animate-gauge-fill", TONE_CLASSES[tone])}
        stroke="currentColor"
        style={
          {
            strokeDasharray: CIRCUMFERENCE,
            "--gauge-circumference": CIRCUMFERENCE,
            "--gauge-offset": offset,
          } as CSSProperties
        }
      />
    </svg>
  );
}

export { ProgressRing };

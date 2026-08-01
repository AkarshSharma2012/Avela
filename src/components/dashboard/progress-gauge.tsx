import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const TONE_CLASSES = {
  primary: "text-primary",
  success: "text-success",
} as const;

/**
 * A compact circular progress ring — real percentages only (profile
 * documentation completeness, application task momentum). The sweep is a
 * pure CSS keyframe (see globals.css's gauge-fill) driven by per-instance
 * --gauge-circumference/--gauge-offset custom properties, so it needs no
 * client JS and automatically collapses under prefers-reduced-motion via
 * the app-wide media query.
 */
function ProgressGauge({
  percent,
  label,
  sublabel,
  tone = "primary",
}: {
  percent: number;
  label: string;
  sublabel?: string;
  tone?: keyof typeof TONE_CLASSES;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const offset = CIRCUMFERENCE * (1 - clamped / 100);

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="flex flex-1 items-center gap-4 rounded-lg border border-border bg-card px-4 py-4"
    >
      <svg viewBox="0 0 100 100" aria-hidden="true" className="size-16 shrink-0 -rotate-90">
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
      <div className="min-w-0">
        <p className="font-sans text-2xl font-bold tabular-nums text-foreground">{clamped}%</p>
        <p className="text-xs font-semibold text-foreground">{label}</p>
        {sublabel && <p className="mt-0.5 text-[0.7rem] leading-snug text-muted-foreground">{sublabel}</p>}
      </div>
    </div>
  );
}

export { ProgressGauge };

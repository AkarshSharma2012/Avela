import { cn } from "@/lib/utils";
import { TOTAL_CARDS, type CardStep } from "@/components/portfolio/capture/flow-state";

/**
 * "Story Signal" — the Portfolio-specific motif (Milestone 10.9.1): a row
 * of bars that reads as a rough, jittery signal on Capture and visibly
 * resolves into a clean waveform by Ready, echoing "a rough idea becomes a
 * polished story." Bar heights/rotation come from a fixed per-index seed
 * so server and client render identically — only the *interpolation*
 * toward "resolved" changes with `step`, driven by CSS transitions on
 * `.story-signal-bar` in globals.css, not a keyframe loop.
 *
 * The seed hash below (Murmur3-style finalizer) deliberately avoids
 * `Math.sin`/`Math.cos`: those are only implementation-approximate per
 * spec, not guaranteed bit-identical across V8 builds, and this component
 * is server-rendered — Node's V8 and Playwright/Chromium's V8 disagreeing
 * in the last few ULPs of a `Math.sin` call previously produced a real
 * SSR/client hydration mismatch on every load. `Math.imul` and bitwise ops
 * are exactly specified, so this hash is bit-identical everywhere.
 */

const BAR_COUNT = 14;
const MAX_JITTER_HEIGHT = 16;
const MAX_ROTATE = 9;

function seededUnit(i: number): number {
  let x = Math.imul(i + 1, 2654435761);
  x = Math.imul(x ^ (x >>> 16), 2246822507);
  x = Math.imul(x ^ (x >>> 13), 3266489909);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** A deterministic triangle-wave silhouette (rises then falls) — arithmetic only, no transcendental functions. */
function triangleShape(i: number): number {
  const position = (i + 1) / (BAR_COUNT + 1);
  return 1 - Math.abs(position - 0.5) * 2;
}

function StorySignal({ step, className }: { step: CardStep; className?: string }) {
  const resolveFraction = (step - 1) / (TOTAL_CARDS - 1);
  const jitter = 1 - resolveFraction;
  const activeBarIndex = Math.round(resolveFraction * (BAR_COUNT - 1));

  return (
    <div className={cn("flex h-6 items-end gap-[3px]", className)} aria-hidden="true">
      {Array.from({ length: BAR_COUNT }, (_, i) => {
        const seed = seededUnit(i);
        const shape = triangleShape(i);
        const resolvedHeight = 7 + shape * 13;
        const jitterOffset = (seed - 0.5) * 2 * MAX_JITTER_HEIGHT * jitter;
        const height = Math.max(4, resolvedHeight * (1 - jitter * 0.25) + jitterOffset);
        const rotate = (seed - 0.5) * 2 * MAX_ROTATE * jitter;
        const resolvedPct = Math.round(resolveFraction * 100);
        return (
          <span
            key={i}
            className={cn("story-signal-bar w-[3px] rounded-full", i === activeBarIndex && "animate-signal-bar-glow")}
            style={{
              height: `${height.toFixed(4)}px`,
              transform: `rotate(${rotate.toFixed(4)}deg)`,
              backgroundColor: `color-mix(in oklch, var(--signal) ${resolvedPct}%, var(--border))`,
            }}
          />
        );
      })}
    </div>
  );
}

export { StorySignal };

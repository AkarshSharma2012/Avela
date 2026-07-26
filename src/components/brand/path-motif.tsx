import { cn } from "@/lib/utils";

const POINTS: [number, number][] = [
  [18, 210],
  [58, 165],
  [46, 108],
  [92, 78],
  [138, 96],
  [150, 46],
];

const PATH = POINTS.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");

/**
 * Avela's signature motif: a quiet constellation of waypoints connected by a
 * single path — "paths, progress, discovery, future possibilities" made
 * literal. Purely decorative; kept sparse and low-contrast so it never
 * competes with the form or content it sits behind.
 */
function PathMotif({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 170 230"
      aria-hidden="true"
      className={cn("pointer-events-none absolute text-primary", className)}
    >
      <path
        d={PATH}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.22"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {POINTS.map(([x, y], i) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r={i === POINTS.length - 1 ? 4 : 2.5}
          className={cn(
            i === POINTS.length - 1 ? "fill-gold" : "fill-primary/40",
            "animate-spark"
          )}
          style={{ animationDelay: `${i * 0.4}s` }}
        />
      ))}
    </svg>
  );
}

export { PathMotif };

import { cn } from "@/lib/utils";

/**
 * Avela's branded loading indicator: three waypoints on a path, lighting up
 * in sequence — the same "progress along a path" idea as the onboarding
 * progress line, scaled down for buttons and route loading states.
 */
function Spinner({
  className,
  label = "Loading",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 40 12"
      className={cn("h-3 w-10 shrink-0 overflow-visible", className)}
      role="status"
      aria-label={label}
    >
      <line
        x1="4"
        y1="6"
        x2="36"
        y2="6"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {[4, 20, 36].map((cx, i) => (
        <circle
          key={cx}
          cx={cx}
          cy="6"
          r="3"
          fill="currentColor"
          className="animate-dot-pulse"
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </svg>
  );
}

export { Spinner };

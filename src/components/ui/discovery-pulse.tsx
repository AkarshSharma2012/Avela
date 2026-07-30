import { cn } from "@/lib/utils";

/**
 * Avela's signature motif: concentric rings expanding outward from a
 * center point, echoing a signal/sonar sweep — literally what "Find more
 * opportunities" is doing (scanning trusted sources), not decoration.
 * Used for the discovery-specific loading state; `MatchSignal` (below)
 * reuses the same concentric-ring language for match strength.
 * `prefers-reduced-motion` is handled globally in globals.css (animation
 * durations collapse to ~0), so this never needs its own media query.
 */
function DiscoveryPulse({ className, label = "Searching" }: { className?: string; label?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn("relative flex size-8 shrink-0 items-center justify-center", className)}
    >
      <span className="animate-pulse-ring-slow absolute inset-0 rounded-full bg-signal/25" />
      <span className="absolute inset-0 rounded-full border border-signal/40 [animation-delay:-0.5s]" />
      {[0, 0.6, 1.2].map((delay) => (
        <span
          key={delay}
          className="animate-pulse-ring absolute inset-0 rounded-full border-2 border-primary/70"
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
      <span className="relative size-2.5 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
    </span>
  );
}

const SIGNAL_TIER_RINGS = {
  strong_fit: 3,
  possible_fit: 2,
  limited_fit: 1,
} as const;

/**
 * A three-ring "signal strength" indicator — filled rings = match tier.
 * Never the only signal for a tier (MatchBadge's icon+text label is always
 * shown alongside it), just a scannable, on-brand reinforcement.
 */
function MatchSignal({
  tier,
  className,
}: {
  tier: keyof typeof SIGNAL_TIER_RINGS;
  className?: string;
}) {
  const filled = SIGNAL_TIER_RINGS[tier];
  return (
    <span className={cn("inline-flex items-end gap-0.5", className)} aria-hidden="true">
      {[1, 2, 3].map((ring) => (
        <span
          key={ring}
          className={cn(
            "w-1 rounded-full transition-colors",
            ring === 1 && "h-1.5",
            ring === 2 && "h-2.5",
            ring === 3 && "h-3.5",
            ring <= filled ? "bg-current" : "bg-current/20"
          )}
        />
      ))}
    </span>
  );
}

export { DiscoveryPulse, MatchSignal };

import type { ProfileStrength } from "@/lib/portfolio/strength";
import { cn } from "@/lib/utils";

/**
 * The transparent, explainable score from strength.ts — every point shown
 * next to the reason it was earned, never a bare number. Framed as
 * guidance ("here's what would help"), never a judgment.
 *
 * Milestone 10.9 fix: this percent is documentation *completeness*
 * (coverage/volume/detail/proof/linked/trust-bonus) — it has never been a
 * legitimacy or verification score, but a bare "25%" next to a legitimate,
 * fully-evidenced project reads exactly like one (spec: "showed
 * approximately 25% for a legitimate Avela software project despite
 * connected GitHub evidence..."). The always-visible caption below exists
 * so this number is never mistaken for claim-level support — that's
 * src/lib/claims/rollup.ts's summarizeClaimDimensions() output instead
 * (see ClaimDimensionsPanel / VerificationStatusCard), shown on each
 * item's own page.
 */
function ProfileStrengthMeter({ strength, showReasons = true }: { strength: ProfileStrength; showReasons?: boolean }) {
  const percent = strength.maxScore === 0 ? 0 : Math.round((strength.score / strength.maxScore) * 100);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Documentation completeness"
            className="h-2 flex-1 overflow-hidden rounded-full bg-secondary"
          >
            <div
              className={cn("h-full rounded-full bg-primary transition-all duration-[var(--duration-base)]")}
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="shrink-0 text-sm font-medium text-foreground">{percent}%</span>
        </div>
        <p className="text-[0.7rem] text-muted-foreground">
          Documentation completeness — how filled-in your portfolio is, not how verified it is. See each item&apos;s own page for its support level.
        </p>
      </div>

      {showReasons && strength.reasons.length > 0 && (
        <ul className="flex flex-col gap-1">
          {strength.reasons.map((reason) => (
            <li key={reason.label} className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{reason.label}</span>
              <span className="shrink-0 tabular-nums">
                {reason.points}/{reason.maxPoints}
              </span>
            </li>
          ))}
        </ul>
      )}

      {showReasons && strength.suggestions.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-border pt-2">
          {strength.suggestions.map((suggestion) => (
            <li key={suggestion} className="text-xs text-muted-foreground">
              Tip: {suggestion}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export { ProfileStrengthMeter };

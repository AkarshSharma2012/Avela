import type { ReactNode } from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

type TrackNodeState = "done" | "current" | "upcoming";

type TrackNode = {
  key: string | number;
  state: TrackNodeState;
  label?: ReactNode;
};

/**
 * A row of connected waypoints — Avela's shared "path" motif for showing
 * discrete progress, used by both the onboarding progress bar and the
 * dashboard's milestone summary.
 */
function NodeTrack({
  nodes,
  size = "sm",
  hideConnectorBelowSm = false,
}: {
  nodes: TrackNode[];
  size?: "sm" | "md";
  /** Hide the connecting line on narrow screens, showing only the nodes stacked. */
  hideConnectorBelowSm?: boolean;
}) {
  const dotSize = size === "md" ? "size-6" : "size-5";
  const iconSize = size === "md" ? "size-3.5" : "size-3";

  return (
    <div
      className={cn(
        "flex items-center",
        hideConnectorBelowSm && "flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-0"
      )}
    >
      {nodes.map((node, i) => (
        <div key={node.key} className="flex flex-1 items-center last:flex-none">
          <div className="flex items-center gap-2.5">
            <span
              key={`${node.key}-${node.state}`}
              className={cn(
                "animate-dot-pop flex shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                dotSize,
                node.state === "done" && "border-primary bg-primary text-primary-foreground",
                node.state === "current" &&
                  "border-gold bg-card text-gold shadow-[var(--shadow-gold)]",
                node.state === "upcoming" && "border-border bg-card text-transparent"
              )}
            >
              {node.state === "done" ? (
                <Check className={iconSize} strokeWidth={3} aria-hidden="true" />
              ) : (
                <span className="size-1.5 rounded-full bg-current" />
              )}
            </span>
            {node.label != null && (
              <span
                className={cn(
                  "text-sm font-medium whitespace-nowrap",
                  node.state === "upcoming" ? "text-muted-foreground" : "text-foreground"
                )}
              >
                {node.label}
              </span>
            )}
          </div>
          {i < nodes.length - 1 && (
            <div
              className={cn(
                "relative mx-3 h-0.5 flex-1 overflow-hidden rounded-full bg-muted",
                hideConnectorBelowSm && "hidden sm:block"
              )}
            >
              <div
                className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-primary transition-transform duration-[var(--duration-page)] ease-[var(--ease-standard)]"
                style={{ transform: `scaleX(${node.state === "done" ? 1 : 0})` }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export { NodeTrack };
export type { TrackNode };

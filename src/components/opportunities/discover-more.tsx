"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, Bookmark, Compass, Search, Sparkles, UserCog } from "lucide-react";

import { OpportunityCard } from "@/components/opportunities/opportunity-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { DiscoveryPulse } from "@/components/ui/discovery-pulse";
import { cn } from "@/lib/utils";
import { findMoreAction, type FindMoreActionResult } from "@/lib/opportunities/discovery-actions";

type Found = Extract<FindMoreActionResult, { ok: true }>["recommendations"][number];

/** Purely cosmetic — an honest approximation of what the server is doing, not a real progress stream (the Server Action itself is one synchronous await). Timings are just far enough apart that a fast catalog-only response never flashes through more than the first line. */
const PROGRESS_STEPS = [
  { afterMs: 0, label: "Finding more opportunities" },
  { afterMs: 2500, label: "Checking trusted sources" },
  { afterMs: 6000, label: "Reviewing eligibility and deadlines" },
] as const;

type ResultState =
  | { kind: "idle" }
  | { kind: "found"; message: string | null }
  | { kind: "no_new"; message: string | null }
  | { kind: "profile_incomplete"; message: string }
  | { kind: "temporary_problem"; message: string }
  | { kind: "error"; message: string };

function classifyResult(result: FindMoreActionResult): ResultState {
  if (!result.ok) return { kind: "error", message: result.message };

  switch (result.status) {
    case "profile_incomplete":
      return { kind: "profile_incomplete", message: result.message ?? "Add a few interests or goals to your profile so I know what to search for." };
    case "source_failure_total":
      return { kind: "temporary_problem", message: result.message ?? "I ran into a problem reaching sources just now — please try again in a bit." };
    case "rate_limited":
      return { kind: "temporary_problem", message: result.message ?? "You've reached the limit for new searches right now — please try again in a little while." };
    case "concurrent_run_blocked":
      return { kind: "temporary_problem", message: result.message ?? "A search is already running for you — hang tight and try again shortly." };
    case "no_strong_matches":
      return { kind: "no_new", message: result.message };
    case "only_broader":
    case "ok":
    default:
      return result.recommendations.length > 0
        ? { kind: "found", message: result.message }
        : { kind: "no_new", message: result.message ?? "I searched for more, but I couldn't verify any additional strong matches right now." };
  }
}

function DiscoverMore() {
  const [isPending, startTransition] = useTransition();
  const [found, setFound] = useState<Found[]>([]);
  const [result, setResult] = useState<ResultState>({ kind: "idle" });
  const [progressLabel, setProgressLabel] = useState<(typeof PROGRESS_STEPS)[number]["label"]>(PROGRESS_STEPS[0].label);
  const requestInFlight = useRef(false);

  useEffect(() => {
    if (!isPending) return;
    const timers = PROGRESS_STEPS.slice(1).map((step) =>
      setTimeout(() => setProgressLabel(step.label), step.afterMs)
    );
    return () => timers.forEach(clearTimeout);
  }, [isPending]);

  function search() {
    // Belt-and-suspenders against a double-fire (e.g. a fast repeated Enter
    // key) on top of the server's own rate limit / active-run gate — the
    // button is also `disabled` while pending, but a ref check is
    // synchronous where React state updates aren't.
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setProgressLabel(PROGRESS_STEPS[0].label);

    startTransition(async () => {
      try {
        const actionResult = await findMoreAction();
        setResult(classifyResult(actionResult));
        if (actionResult.ok) {
          setFound((prev) => {
            const seen = new Set(prev.map((f) => f.opportunity.id));
            return [...prev, ...actionResult.recommendations.filter((r) => !seen.has(r.opportunity.id))];
          });
        }
      } finally {
        requestInFlight.current = false;
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {found.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {found.map((entry) => (
            <OpportunityCard
              key={entry.opportunity.id}
              opportunity={entry.opportunity}
              isSaved={false}
              matchResult={entry.matchResult}
              eligibilityResult={entry.eligibilityResult}
              showWhyItFits
              sourceName={entry.sourceName}
            />
          ))}
        </div>
      )}

      <div
        className={cn(
          "flex flex-col items-start gap-3 rounded-xl border px-5 py-4 transition-colors duration-[var(--duration-page)]",
          isPending
            ? "border-primary/25 bg-[color-mix(in_oklch,var(--primary),var(--background)_92%)]"
            : "border-dashed border-border bg-secondary"
        )}
      >
        {isPending ? (
          <p role="status" aria-live="polite" aria-busy="true" className="flex items-center gap-2.5 text-sm text-foreground">
            <DiscoveryPulse label={progressLabel} />
            {progressLabel}…
          </p>
        ) : (
          <>
            <div role="status" aria-live="polite">
              {result.kind === "idle" && (
                <p className="flex items-center gap-2 text-sm text-foreground">
                  <Compass aria-hidden="true" className="size-4 text-primary" />
                  That&apos;s everything I&apos;ve verified for your profile so far.
                </p>
              )}
              {result.kind === "found" && (
                <p className="flex items-center gap-2 text-sm text-foreground">
                  <Sparkles aria-hidden="true" className="size-4 text-primary" />
                  {result.message ?? "New matches found."}
                </p>
              )}
              {result.kind === "no_new" && (
                <p className="text-sm text-muted-foreground">
                  {result.message ?? "No genuinely new matches right now — check back later as more sources are verified."}
                </p>
              )}
              {result.kind === "profile_incomplete" && (
                <p className="flex items-center gap-2 text-sm text-foreground">
                  <UserCog aria-hidden="true" className="size-4 text-primary" />
                  {result.message}
                </p>
              )}
              {(result.kind === "temporary_problem" || result.kind === "error") && (
                <p className="flex items-center gap-2 text-sm text-foreground">
                  <AlertTriangle aria-hidden="true" className="size-4 text-warning" />
                  {result.message}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={search} disabled={isPending}>
                <Search aria-hidden="true" className="size-3.5" />
                {result.kind === "idle" ? "Search for more opportunities" : "Search again"}
              </Button>

              {result.kind === "profile_incomplete" && (
                <Link href="/profile" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                  <UserCog aria-hidden="true" className="size-3.5" />
                  Improve profile
                </Link>
              )}

              {(result.kind === "no_new" || result.kind === "temporary_problem") && (
                <Link href="/saved" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                  <Bookmark aria-hidden="true" className="size-3.5" />
                  View saved matches
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export { DiscoverMore };

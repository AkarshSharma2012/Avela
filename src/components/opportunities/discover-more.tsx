"use client";

import { useState, useTransition } from "react";
import { Search } from "lucide-react";

import { OpportunityCard } from "@/components/opportunities/opportunity-card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { findMoreAction, type FindMoreActionResult } from "@/lib/opportunities/discovery-actions";

type Found = Extract<FindMoreActionResult, { ok: true }>["recommendations"][number];

/**
 * Triggers a fresh, bounded discovery run once the unseen verified catalog
 * is exhausted (see dashboard/page.tsx's "exhausted" branch — pagination
 * via `?shown=` never reaches this component). Results accumulate across
 * repeated clicks in this session rather than replacing the prior batch,
 * so a student who clicks twice never loses what the first search found.
 */
function DiscoverMore() {
  const [isPending, startTransition] = useTransition();
  const [found, setFound] = useState<Found[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  function search() {
    startTransition(async () => {
      const result = await findMoreAction();
      if (!result.ok) {
        setMessage(result.message);
        setHasSearched(true);
        return;
      }
      setMessage(result.message);
      setHasSearched(true);
      setFound((prev) => {
        const seen = new Set(prev.map((f) => f.opportunity.id));
        return [...prev, ...result.recommendations.filter((r) => !seen.has(r.opportunity.id))];
      });
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

      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border bg-secondary px-5 py-4">
        {isPending ? (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner label="Searching trusted sources" />
            Searching a few trusted sources for new matches…
          </p>
        ) : (
          <>
            {message && (
              <p role="status" className="text-sm text-muted-foreground">
                {message}
              </p>
            )}
            {!hasSearched && (
              <p className="text-sm text-foreground">
                That&apos;s everything I&apos;ve verified for your profile so far.
              </p>
            )}
            <Button type="button" variant="outline" size="sm" onClick={search} disabled={isPending}>
              <Search aria-hidden="true" className="size-3.5" />
              {hasSearched ? "Search again" : "Search for more opportunities"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export { DiscoverMore };

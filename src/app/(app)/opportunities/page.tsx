import type { Metadata } from "next";
import { Compass, Search } from "lucide-react";

import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata: Metadata = {
  title: "Opportunities — Avela",
};

// Structure only — matches the filter categories the matching engine will
// use once opportunity discovery is enabled (Milestone 4).
const FILTER_CATEGORIES = [
  "Type",
  "Format",
  "Location",
  "Grade eligibility",
  "Cost",
  "Deadline",
  "Commitment",
];

export default function OpportunitiesPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col px-6 py-10 sm:py-12">
      <div className="stagger-children">
        <p className="animate-fade-up mb-3 text-xs font-medium tracking-wide text-primary uppercase">
          Opportunities
        </p>
        <h1 className="animate-fade-up font-heading text-3xl text-foreground sm:text-4xl">
          Find your next opportunity.
        </h1>
        <p className="animate-fade-up mt-3 max-w-lg text-base leading-relaxed text-text-secondary">
          Search and filtering are ready to go — opportunity discovery itself arrives in a future
          milestone.
        </p>
      </div>

      <div className="animate-fade-up mt-8">
        <Label htmlFor="opportunity-search" className="sr-only">
          Search opportunities
        </Label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="opportunity-search"
            type="search"
            placeholder="Search opportunities"
            disabled
            className="pl-9"
          />
        </div>
      </div>

      <div className="animate-fade-up mt-6">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Filter by
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {FILTER_CATEGORIES.map((category) => (
            <Chip key={category} size="sm" className="text-muted-foreground">
              {category}
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Search and filters turn on once opportunities are live.
        </p>
      </div>

      <div className="animate-fade-up mt-8">
        <EmptyState
          icon={Compass}
          title="Your opportunities will appear here once discovery is enabled."
          description="Nothing to show yet — check back soon."
        />
      </div>
    </div>
  );
}

import Link from "next/link";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PORTFOLIO_ITEM_TYPES } from "@/lib/portfolio/constants";
import { hasActivePortfolioFilters, type PortfolioFilters } from "@/lib/portfolio/search-params";

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-card px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30";

/** A plain `method="get"` form, same convention as OpportunityFilterForm — every control's `name` matches a query param parsePortfolioFilters reads, so it works without JavaScript and the result is a shareable, refresh-safe URL. */
function PortfolioFilterForm({ filters, availableTags }: { filters: PortfolioFilters; availableTags: string[] }) {
  return (
    <form method="get" action="/portfolio" className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-3">
      <div className="flex-1">
        <Label htmlFor="portfolio-search" className="sr-only">
          Search your portfolio
        </Label>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="portfolio-search"
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="Search your items"
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="portfolio-type-filter" className="sr-only">
          Filter by type
        </Label>
        <select id="portfolio-type-filter" name="type" defaultValue={filters.itemTypes[0] ?? ""} className={SELECT_CLASS}>
          <option value="">All types</option>
          {PORTFOLIO_ITEM_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {availableTags.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="portfolio-tag-filter" className="sr-only">
            Filter by tag
          </Label>
          <select id="portfolio-tag-filter" name="tag" defaultValue={filters.tag ?? ""} className={SELECT_CLASS}>
            <option value="">All tags</option>
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        type="submit"
        className="h-9 shrink-0 rounded-lg border border-transparent bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary-hover"
      >
        Search
      </button>
      {hasActivePortfolioFilters(filters) && (
        <Link href="/portfolio" className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Clear
        </Link>
      )}
    </form>
  );
}

export { PortfolioFilterForm };

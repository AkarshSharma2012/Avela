import Link from "next/link";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEADLINE_WINDOWS,
  DISCOVERY_FILTER_TOGGLES,
  OPPORTUNITY_COST_TYPES,
  OPPORTUNITY_FORMATS,
  OPPORTUNITY_TYPES,
  WEEKLY_HOURS_FILTER_OPTIONS,
} from "@/lib/opportunities/constants";
import { hasActiveFilters, type OpportunityFilters } from "@/lib/opportunities/search-params";

const CHECKBOX_CLASS =
  "size-4 rounded-[3px] border-input accent-[var(--primary)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30";

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-card px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30";

function CheckboxRow({
  name,
  value,
  label,
  defaultChecked,
}: {
  name: string;
  value: string;
  label: string;
  defaultChecked: boolean;
}) {
  const id = `filter-${name}-${value}`;
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
      <input
        type="checkbox"
        id={id}
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className={CHECKBOX_CLASS}
      />
      {label}
    </label>
  );
}

/**
 * A plain `method="get"` form: every control's `name` matches a query
 * param that `parseOpportunityFilters` reads, so filtering works with
 * native browser navigation alone — no JavaScript required — and the
 * resulting URL is shareable and survives a refresh. Native
 * `<input type="checkbox">`/`<select>` rather than the Base UI primitives
 * used elsewhere, specifically because those need real name/value form
 * participation without a client-side controller.
 */
function OpportunityFilterForm({
  filters,
  hasGradeLevel,
}: {
  filters: OpportunityFilters;
  hasGradeLevel: boolean;
}) {
  return (
    <form method="get" action="/opportunities" className="flex flex-col gap-5">
      <div>
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
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="Search by title, organization, or description"
            className="pl-9"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Type
          </legend>
          {OPPORTUNITY_TYPES.map((option) => (
            <CheckboxRow
              key={option.value}
              name="type"
              value={option.value}
              label={option.label}
              defaultChecked={filters.types.includes(option.value)}
            />
          ))}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Format
          </legend>
          {OPPORTUNITY_FORMATS.map((option) => (
            <CheckboxRow
              key={option.value}
              name="format"
              value={option.value}
              label={option.label}
              defaultChecked={filters.formats.includes(option.value)}
            />
          ))}
          <CheckboxRow
            name="remote"
            value="true"
            label="Remote only"
            defaultChecked={filters.remoteOnly}
          />
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Cost
          </legend>
          {OPPORTUNITY_COST_TYPES.map((option) => (
            <CheckboxRow
              key={option.value}
              name="cost"
              value={option.value}
              label={option.label}
              defaultChecked={filters.costs.includes(option.value)}
            />
          ))}
          {hasGradeLevel && (
            <CheckboxRow
              name="myGrade"
              value="true"
              label="Eligible for my grade"
              defaultChecked={filters.myGradeOnly}
            />
          )}
        </fieldset>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filter-deadline">Deadline</Label>
            <select
              id="filter-deadline"
              name="deadline"
              defaultValue={filters.deadlineWithin}
              className={SELECT_CLASS}
            >
              {DEADLINE_WINDOWS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filter-max-hours">Weekly commitment</Label>
            <select
              id="filter-max-hours"
              name="maxHours"
              defaultValue={filters.maxWeeklyHours !== null ? String(filters.maxWeeklyHours) : ""}
              className={SELECT_CLASS}
            >
              <option value="">Any</option>
              {WEEKLY_HOURS_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2 border-t border-border pt-4">
        <legend className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Discovery &amp; verification
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {DISCOVERY_FILTER_TOGGLES.map((toggle) => (
            <CheckboxRow
              key={toggle.value}
              name={toggle.paramName}
              value="true"
              label={toggle.label}
              defaultChecked={filters[toggle.value]}
            />
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button type="submit">Apply filters</Button>
        {hasActiveFilters(filters) && (
          <Link
            href="/opportunities"
            className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Clear filters
          </Link>
        )}
      </div>
    </form>
  );
}

export { OpportunityFilterForm };

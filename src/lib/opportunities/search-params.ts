import {
  DEADLINE_WINDOW_VALUES,
  OPPORTUNITY_COST_TYPE_VALUES,
  OPPORTUNITY_FORMAT_VALUES,
  OPPORTUNITY_TYPE_VALUES,
  type DeadlineWindow,
} from "@/lib/opportunities/constants";
import type {
  OpportunityCostType,
  OpportunityFormat,
  OpportunityType,
} from "@/types/database";

export type OpportunityFilters = {
  q: string;
  types: OpportunityType[];
  formats: OpportunityFormat[];
  costs: OpportunityCostType[];
  remoteOnly: boolean;
  myGradeOnly: boolean;
  deadlineWithin: DeadlineWindow;
  maxWeeklyHours: number | null;
  page: number;
  // Milestone 5 — discovery/verification toggles (section 16). Hard
  // exclusions (expired, closed, grade-ineligible, rejected/stale) are
  // hidden by default regardless of these — see query.ts — these only add
  // further narrowing a student opts into.
  verifiedOnly: boolean;
  eligibleOnly: boolean;
  acceptingOnly: boolean;
  rollingOnly: boolean;
  openingSoonOnly: boolean;
  /** Opts back IN to results with an unresolved citizenship requirement — see eligibility-engine.ts on why citizenship can never be a confirmed "eligible" fact from profile data alone. */
  includeUnclearEligibility: boolean;
};

export const EMPTY_FILTERS: OpportunityFilters = {
  q: "",
  types: [],
  formats: [],
  costs: [],
  remoteOnly: false,
  myGradeOnly: false,
  deadlineWithin: "any",
  maxWeeklyHours: null,
  page: 1,
  verifiedOnly: false,
  eligibleOnly: false,
  acceptingOnly: false,
  rollingOnly: false,
  openingSoonOnly: false,
  includeUnclearEligibility: false,
};

/** Next.js hands `searchParams` to pages as `string | string[] | undefined` per key. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function parsePositiveInt(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Parses the awaited `searchParams` object from a Next.js page into typed,
 * defaulted filters. Unknown/invalid values (a bogus `type`, a negative
 * `page`) are silently dropped rather than throwing, since a malformed URL
 * a student typed or an old shared link should degrade to "no filter", not
 * a 500.
 */
export function parseOpportunityFilters(raw: RawSearchParams): OpportunityFilters {
  const q = (Array.isArray(raw.q) ? raw.q[0] : raw.q)?.trim() ?? "";

  const types = toArray(raw.type).filter((value): value is OpportunityType =>
    (OPPORTUNITY_TYPE_VALUES as readonly string[]).includes(value)
  );
  const formats = toArray(raw.format).filter((value): value is OpportunityFormat =>
    (OPPORTUNITY_FORMAT_VALUES as readonly string[]).includes(value)
  );
  const costs = toArray(raw.cost).filter((value): value is OpportunityCostType =>
    (OPPORTUNITY_COST_TYPE_VALUES as readonly string[]).includes(value)
  );

  const rawDeadline = Array.isArray(raw.deadline) ? raw.deadline[0] : raw.deadline;
  const deadlineWithin = (DEADLINE_WINDOW_VALUES as readonly string[]).includes(rawDeadline ?? "")
    ? (rawDeadline as DeadlineWindow)
    : "any";

  const page = parsePositiveInt(raw.page) ?? 1;

  return {
    q,
    types,
    formats,
    costs,
    remoteOnly: (Array.isArray(raw.remote) ? raw.remote[0] : raw.remote) === "true",
    myGradeOnly: (Array.isArray(raw.myGrade) ? raw.myGrade[0] : raw.myGrade) === "true",
    deadlineWithin,
    maxWeeklyHours: parsePositiveInt(raw.maxHours),
    page,
    verifiedOnly: (Array.isArray(raw.verified) ? raw.verified[0] : raw.verified) === "true",
    eligibleOnly: (Array.isArray(raw.eligible) ? raw.eligible[0] : raw.eligible) === "true",
    acceptingOnly: (Array.isArray(raw.accepting) ? raw.accepting[0] : raw.accepting) === "true",
    rollingOnly: (Array.isArray(raw.rolling) ? raw.rolling[0] : raw.rolling) === "true",
    openingSoonOnly:
      (Array.isArray(raw.openingSoon) ? raw.openingSoon[0] : raw.openingSoon) === "true",
    includeUnclearEligibility:
      (Array.isArray(raw.includeUnclear) ? raw.includeUnclear[0] : raw.includeUnclear) === "true",
  };
}

/** True if any filter narrows the result set beyond "everything, page 1". */
export function hasActiveFilters(filters: OpportunityFilters): boolean {
  return (
    filters.q !== "" ||
    filters.types.length > 0 ||
    filters.formats.length > 0 ||
    filters.costs.length > 0 ||
    filters.remoteOnly ||
    filters.myGradeOnly ||
    filters.deadlineWithin !== "any" ||
    filters.maxWeeklyHours !== null ||
    filters.verifiedOnly ||
    filters.eligibleOnly ||
    filters.acceptingOnly ||
    filters.rollingOnly ||
    filters.openingSoonOnly ||
    filters.includeUnclearEligibility
  );
}

/** Serializes filters back to a query string, for pagination links that must preserve every other filter. */
export function filtersToSearchParams(filters: OpportunityFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  for (const type of filters.types) params.append("type", type);
  for (const format of filters.formats) params.append("format", format);
  for (const cost of filters.costs) params.append("cost", cost);
  if (filters.remoteOnly) params.set("remote", "true");
  if (filters.myGradeOnly) params.set("myGrade", "true");
  if (filters.deadlineWithin !== "any") params.set("deadline", filters.deadlineWithin);
  if (filters.maxWeeklyHours !== null) params.set("maxHours", String(filters.maxWeeklyHours));
  if (filters.verifiedOnly) params.set("verified", "true");
  if (filters.eligibleOnly) params.set("eligible", "true");
  if (filters.acceptingOnly) params.set("accepting", "true");
  if (filters.rollingOnly) params.set("rolling", "true");
  if (filters.openingSoonOnly) params.set("openingSoon", "true");
  if (filters.includeUnclearEligibility) params.set("includeUnclear", "true");
  if (filters.page > 1) params.set("page", String(filters.page));
  return params;
}

export function buildPageHref(filters: OpportunityFilters, page: number): string {
  const params = filtersToSearchParams({ ...filters, page });
  const query = params.toString();
  return query ? `/opportunities?${query}` : "/opportunities";
}

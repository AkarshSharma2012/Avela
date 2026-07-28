import { describe, expect, it } from "vitest";

import {
  buildPageHref,
  EMPTY_FILTERS,
  filtersToSearchParams,
  hasActiveFilters,
  parseOpportunityFilters,
  resolveBrowseNextAction,
} from "@/lib/opportunities/search-params";
import { PAGE_SIZE } from "@/lib/opportunities/constants";

describe("parseOpportunityFilters", () => {
  it("defaults to empty filters and page 1 when given nothing", () => {
    expect(parseOpportunityFilters({})).toEqual(EMPTY_FILTERS);
  });

  it("parses a single-valued type/format/cost into an array", () => {
    const filters = parseOpportunityFilters({ type: "internship", format: "virtual", cost: "free" });
    expect(filters.types).toEqual(["internship"]);
    expect(filters.formats).toEqual(["virtual"]);
    expect(filters.costs).toEqual(["free"]);
  });

  it("parses repeated params (Next.js array form) as multi-select", () => {
    const filters = parseOpportunityFilters({ type: ["internship", "research"] });
    expect(filters.types).toEqual(["internship", "research"]);
  });

  it("silently drops unknown/invalid enum values instead of throwing", () => {
    const filters = parseOpportunityFilters({ type: ["internship", "bogus"], deadline: "nonsense" });
    expect(filters.types).toEqual(["internship"]);
    expect(filters.deadlineWithin).toBe("any");
  });

  it("trims whitespace from the search query", () => {
    expect(parseOpportunityFilters({ q: "  robotics  " }).q).toBe("robotics");
  });

  it("parses boolean flags only from the literal string 'true'", () => {
    expect(parseOpportunityFilters({ remote: "true" }).remoteOnly).toBe(true);
    expect(parseOpportunityFilters({ remote: "1" }).remoteOnly).toBe(false);
    expect(parseOpportunityFilters({ myGrade: "true" }).myGradeOnly).toBe(true);
  });

  it("parses the Milestone 5 discovery/verification toggles from literal 'true'", () => {
    const filters = parseOpportunityFilters({
      verified: "true",
      eligible: "true",
      accepting: "true",
      rolling: "true",
      openingSoon: "true",
      includeUnclear: "true",
    });
    expect(filters.verifiedOnly).toBe(true);
    expect(filters.eligibleOnly).toBe(true);
    expect(filters.acceptingOnly).toBe(true);
    expect(filters.rollingOnly).toBe(true);
    expect(filters.openingSoonOnly).toBe(true);
    expect(filters.includeUnclearEligibility).toBe(true);
  });

  it("parses a positive integer maxHours, ignoring invalid values", () => {
    expect(parseOpportunityFilters({ maxHours: "5" }).maxWeeklyHours).toBe(5);
    expect(parseOpportunityFilters({ maxHours: "-5" }).maxWeeklyHours).toBeNull();
    expect(parseOpportunityFilters({ maxHours: "abc" }).maxWeeklyHours).toBeNull();
  });

  it("clamps an invalid page to 1 rather than throwing", () => {
    expect(parseOpportunityFilters({ page: "0" }).page).toBe(1);
    expect(parseOpportunityFilters({ page: "-3" }).page).toBe(1);
    expect(parseOpportunityFilters({ page: "abc" }).page).toBe(1);
    expect(parseOpportunityFilters({ page: "3" }).page).toBe(3);
  });
});

describe("hasActiveFilters", () => {
  it("is false for the empty filter set", () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });

  it("is true when any single filter narrows the result set", () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, q: "robotics" })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, types: ["internship"] })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, remoteOnly: true })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, deadlineWithin: "30d" })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, maxWeeklyHours: 5 })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, verifiedOnly: true })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, includeUnclearEligibility: true })).toBe(true);
  });

  it("is false when only the page differs from 1", () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, page: 2 })).toBe(false);
  });
});

/** Mirrors how Next.js groups repeated query keys into an array before handing `searchParams` to a page. */
function searchParamsToRaw(params: URLSearchParams): Record<string, string | string[]> {
  const raw: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    raw[key] = values.length > 1 ? values : values[0];
  }
  return raw;
}

describe("filtersToSearchParams / buildPageHref", () => {
  it("round-trips through parseOpportunityFilters", () => {
    const original = parseOpportunityFilters({
      q: "robotics",
      type: ["internship", "research"],
      remote: "true",
      deadline: "30d",
      maxHours: "5",
    });

    const params = filtersToSearchParams(original);
    const reparsed = parseOpportunityFilters(searchParamsToRaw(params));

    expect(reparsed.q).toBe(original.q);
    expect(reparsed.types).toEqual(original.types);
    expect(reparsed.remoteOnly).toBe(original.remoteOnly);
    expect(reparsed.deadlineWithin).toBe(original.deadlineWithin);
    expect(reparsed.maxWeeklyHours).toBe(original.maxWeeklyHours);
  });

  it("omits page from the query string when it's 1", () => {
    const params = filtersToSearchParams(EMPTY_FILTERS);
    expect(params.has("page")).toBe(false);
  });

  it("builds a page link that preserves every other filter", () => {
    const filters = { ...EMPTY_FILTERS, q: "robotics", remoteOnly: true, page: 1 };
    expect(buildPageHref(filters, 2)).toBe("/opportunities?q=robotics&remote=true&page=2");
  });

  it("returns the bare path when there are no active filters and page is 1", () => {
    expect(buildPageHref(EMPTY_FILTERS, 1)).toBe("/opportunities");
  });
});

describe("resolveBrowseNextAction", () => {
  it("shows Find more when unfiltered and unseen real catalog rows remain beyond this page", () => {
    const action = resolveBrowseNextAction(EMPTY_FILTERS, PAGE_SIZE * 2);
    expect(action).toEqual({ kind: "find_more", href: buildPageHref(EMPTY_FILTERS, 2) });
  });

  it("shows Search for more once the unfiltered real catalog is fully paged through", () => {
    const lastPage = { ...EMPTY_FILTERS, page: 2 };
    const action = resolveBrowseNextAction(lastPage, PAGE_SIZE * 2);
    expect(action).toEqual({ kind: "search_more" });
  });

  it("treats an exact single page as exhausted (Search for more), not Find more", () => {
    const action = resolveBrowseNextAction(EMPTY_FILTERS, PAGE_SIZE);
    expect(action).toEqual({ kind: "search_more" });
  });

  it("falls back to classic Pagination whenever any filter narrows the results, regardless of offset", () => {
    expect(
      resolveBrowseNextAction({ ...EMPTY_FILTERS, types: ["internship"], page: 1 }, PAGE_SIZE * 5)
    ).toEqual({ kind: "paginate" });

    expect(
      resolveBrowseNextAction({ ...EMPTY_FILTERS, q: "robotics", page: 3 }, PAGE_SIZE)
    ).toEqual({ kind: "paginate" });
  });

  it("never requires a special query parameter — the default page-1 view (parsed from no params at all) resolves on its own", () => {
    const defaultFilters = parseOpportunityFilters({});
    expect(defaultFilters).toEqual(EMPTY_FILTERS);
    expect(resolveBrowseNextAction(defaultFilters, PAGE_SIZE * 3).kind).toBe("find_more");
  });
});

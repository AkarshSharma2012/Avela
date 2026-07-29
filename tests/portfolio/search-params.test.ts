import { describe, expect, it } from "vitest";

import { collectAllTags, filterPortfolioItems, hasActivePortfolioFilters, parsePortfolioFilters } from "@/lib/portfolio/search-params";
import type { PortfolioItem } from "@/types/portfolio";

function makeItem(overrides: Partial<PortfolioItem> = {}): PortfolioItem {
  return {
    id: "item-1",
    user_id: "user-1",
    item_type: "activity",
    title: "Debate Team",
    organization: null,
    description: null,
    start_date: null,
    end_date: null,
    is_current: false,
    hours_per_week: null,
    weeks_per_year: null,
    role: null,
    outcome: null,
    skills: [],
    tags: [],
    url: null,
    github_username: null,
    project_context: null,
    activity_category_key: null,
    template_version: 1,
    last_material_hash: null,
    material_hash_updated_at: null,
    visibility: "visible",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

describe("parsePortfolioFilters", () => {
  it("degrades a malformed/unknown type to no filter rather than throwing", () => {
    expect(parsePortfolioFilters({ type: "not-a-real-type" }).itemTypes).toEqual([]);
  });

  it("parses a known type", () => {
    expect(parsePortfolioFilters({ type: "award" }).itemTypes).toEqual(["award"]);
  });

  it("trims the search query and empty tag", () => {
    expect(parsePortfolioFilters({ q: "  debate  " }).q).toBe("debate");
    expect(parsePortfolioFilters({ tag: "" }).tag).toBeNull();
  });
});

describe("hasActivePortfolioFilters", () => {
  it("is false for the empty filter set", () => {
    expect(hasActivePortfolioFilters(parsePortfolioFilters({}))).toBe(false);
  });

  it("is true once a query, type, or tag is set", () => {
    expect(hasActivePortfolioFilters(parsePortfolioFilters({ q: "x" }))).toBe(true);
    expect(hasActivePortfolioFilters(parsePortfolioFilters({ type: "award" }))).toBe(true);
    expect(hasActivePortfolioFilters(parsePortfolioFilters({ tag: "stem" }))).toBe(true);
  });
});

describe("filterPortfolioItems", () => {
  const debate = makeItem({ id: "1", title: "Debate Team", item_type: "activity", tags: ["speech"] });
  const award = makeItem({ id: "2", title: "Science Fair Award", item_type: "award", tags: ["stem"], outcome: "Won first place." });
  const items = [debate, award];

  it("filters by item type", () => {
    expect(filterPortfolioItems(items, { q: "", itemTypes: ["award"], tag: null, includeArchived: false, verificationLevel: null })).toEqual([award]);
  });

  it("filters by tag, case-insensitively", () => {
    expect(filterPortfolioItems(items, { q: "", itemTypes: [], tag: "STEM", includeArchived: false, verificationLevel: null })).toEqual([award]);
  });

  it("filters by search text across title, outcome, and tags", () => {
    expect(filterPortfolioItems(items, { q: "first place", itemTypes: [], tag: null, includeArchived: false, verificationLevel: null })).toEqual([award]);
    expect(filterPortfolioItems(items, { q: "Debate", itemTypes: [], tag: null, includeArchived: false, verificationLevel: null })).toEqual([debate]);
  });

  it("returns everything for the empty filter set", () => {
    expect(filterPortfolioItems(items, { q: "", itemTypes: [], tag: null, includeArchived: false, verificationLevel: null })).toEqual(items);
  });

  it("filters by verification level, treating an item with no record as unverified", () => {
    const verificationMap = new Map([["2", "externally_confirmed" as const]]);
    expect(
      filterPortfolioItems(items, { q: "", itemTypes: [], tag: null, includeArchived: false, verificationLevel: "unverified" }, verificationMap)
    ).toEqual([debate]);
    expect(
      filterPortfolioItems(
        items,
        { q: "", itemTypes: [], tag: null, includeArchived: false, verificationLevel: "externally_confirmed" },
        verificationMap
      )
    ).toEqual([award]);
  });
});

describe("collectAllTags", () => {
  it("returns every distinct tag across items, sorted", () => {
    const items = [makeItem({ tags: ["stem", "weekend"] }), makeItem({ tags: ["stem", "leadership"] })];
    expect(collectAllTags(items)).toEqual(["leadership", "stem", "weekend"]);
  });

  it("returns an empty list when no items have tags", () => {
    expect(collectAllTags([makeItem()])).toEqual([]);
  });
});

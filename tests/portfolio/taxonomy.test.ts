import { describe, expect, it } from "vitest";

import {
  ACTIVITY_CATEGORIES,
  GENERIC_CATEGORY_FALLBACK,
  PASSION_GROUPS,
  isKnownCategory,
  listCategoriesByPassionGroup,
  resolveCategory,
} from "@/lib/portfolio/taxonomy";
import { PORTFOLIO_ITEM_TYPES } from "@/lib/portfolio/constants";

const KNOWN_ITEM_TYPES = new Set(PORTFOLIO_ITEM_TYPES.map((option) => option.value));

describe("ACTIVITY_CATEGORIES", () => {
  it("has at least 10 categories in every one of the 11 passion groups", () => {
    for (const group of PASSION_GROUPS) {
      expect(listCategoriesByPassionGroup(group).length).toBeGreaterThanOrEqual(10);
    }
  });

  it("has unique keys across the whole taxonomy", () => {
    const keys = ACTIVITY_CATEGORIES.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps every key within the migration's 100-character bound", () => {
    for (const entry of ACTIVITY_CATEGORIES) {
      expect(entry.key.length).toBeLessThanOrEqual(100);
    }
  });

  it("maps every category to an existing, fairly-scored PortfolioItemType bucket", () => {
    for (const entry of ACTIVITY_CATEGORIES) {
      expect(KNOWN_ITEM_TYPES.has(entry.itemTypeBucket)).toBe(true);
    }
  });

  it("never shows internal keys as labels — every label is a distinct, friendly string", () => {
    for (const entry of ACTIVITY_CATEGORIES) {
      expect(entry.label).not.toBe(entry.key);
      expect(entry.label.includes("_")).toBe(false);
    }
  });

  it("includes the go-kart category as a first-class mechanical build under Making & Engineering", () => {
    const goKart = resolveCategory("mechanical_build");
    expect(goKart.passionGroup).toBe("making_and_engineering");
    expect(goKart.itemTypeBucket).toBe("project");
  });
});

describe("resolveCategory", () => {
  it("resolves every declared key to itself", () => {
    for (const entry of ACTIVITY_CATEGORIES) {
      expect(resolveCategory(entry.key)).toEqual(entry);
    }
  });

  it("falls back to the generic category for an unknown or future key, never throwing", () => {
    expect(resolveCategory("some_future_category_not_yet_invented")).toEqual(GENERIC_CATEGORY_FALLBACK);
  });

  it("falls back to the generic category for null/undefined/empty input", () => {
    expect(resolveCategory(null)).toEqual(GENERIC_CATEGORY_FALLBACK);
    expect(resolveCategory(undefined)).toEqual(GENERIC_CATEGORY_FALLBACK);
    expect(resolveCategory("")).toEqual(GENERIC_CATEGORY_FALLBACK);
  });
});

describe("isKnownCategory", () => {
  it("is true only for declared keys", () => {
    expect(isKnownCategory("mechanical_build")).toBe(true);
    expect(isKnownCategory("not_a_real_category")).toBe(false);
    expect(isKnownCategory(null)).toBe(false);
  });
});

describe("fairness-relevant category pairs (spec section 14)", () => {
  it("go-kart (mechanical_build) and a coding project share the same item_type bucket", () => {
    expect(resolveCategory("mechanical_build").itemTypeBucket).toBe(resolveCategory("coding").itemTypeBucket);
  });

  it("painting and a software project share the same item_type bucket", () => {
    expect(resolveCategory("painting").itemTypeBucket).toBe(resolveCategory("web_or_app").itemTypeBucket);
  });

  it("a music project and a GitHub-style coding project share the same item_type bucket", () => {
    expect(resolveCategory("music_performance").itemTypeBucket).toBe(resolveCategory("coding").itemTypeBucket);
  });

  it("informal volunteering resolves to the same item_type as formal volunteering", () => {
    expect(resolveCategory("informal_volunteering").itemTypeBucket).toBe(resolveCategory("nonprofit_volunteering").itemTypeBucket);
  });
});

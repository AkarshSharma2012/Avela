import { describe, expect, it } from "vitest";

import { buildResumeSummary, getExpectedFields } from "@/lib/portfolio/summary";
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
    visibility: "visible",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildResumeSummary", () => {
  it("uses only the fields the student actually entered", () => {
    const { summary } = buildResumeSummary(
      makeItem({ organization: "Lincoln High", role: "Captain", outcome: "Led the team to state finals." })
    );
    expect(summary).toContain("Debate Team");
    expect(summary).toContain("Captain");
    expect(summary).toContain("Lincoln High");
    expect(summary).toContain("Led the team to state finals.");
  });

  it("never invents an achievement or outcome that wasn't entered", () => {
    const { summary } = buildResumeSummary(makeItem());
    expect(summary).toBe("Debate Team");
    expect(summary).not.toMatch(/won|led|achieved|accomplished/i);
  });

  it("reports missing relevant fields instead of fabricating them", () => {
    const { missingFields } = buildResumeSummary(makeItem({ item_type: "award" }));
    expect(missingFields).toContain("organization");
    expect(missingFields).toContain("dates");
    expect(missingFields).toContain("outcome");
  });

  it("never reports a field as missing for a type it isn't relevant to", () => {
    const { missingFields } = buildResumeSummary(makeItem({ item_type: "link" }));
    expect(missingFields).toEqual([]);
  });

  it("formats a date range using only real, entered dates", () => {
    const { summary } = buildResumeSummary(makeItem({ start_date: "2025-09-01", end_date: "2026-06-01" }));
    expect(summary).toMatch(/Sep 2025.*Jun 2026/);
  });

  it("shows 'present' for a currently-ongoing item instead of inventing an end date", () => {
    const { summary } = buildResumeSummary(makeItem({ start_date: "2025-09-01", is_current: true }));
    expect(summary).toMatch(/present/i);
  });

  it("includes skills verbatim, never rewritten", () => {
    const { summary } = buildResumeSummary(makeItem({ skills: ["Public speaking", "Research"] }));
    expect(summary).toContain("Public speaking, Research");
  });

  it("never produces a full essay — output stays a short factual sentence even with every field filled", () => {
    const { summary } = buildResumeSummary(
      makeItem({
        organization: "Lincoln High",
        role: "Captain",
        outcome: "Led the team to state finals.",
        skills: ["Public speaking"],
        start_date: "2025-09-01",
        end_date: "2026-06-01",
      })
    );
    expect(summary.length).toBeLessThan(400);
  });
});

describe("getExpectedFields", () => {
  it("returns no expected fields for pure reference types (document, link)", () => {
    expect(getExpectedFields("document")).toEqual([]);
    expect(getExpectedFields("link")).toEqual([]);
  });

  it("returns a non-empty set for a substantive type like project", () => {
    expect(getExpectedFields("project").length).toBeGreaterThan(0);
  });
});

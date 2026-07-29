import { describe, expect, it } from "vitest";

import { buildPortfolioDashboardSummary } from "@/lib/portfolio/dashboard";
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

describe("buildPortfolioDashboardSummary", () => {
  it("counts incomplete items among the given items", () => {
    const summary = buildPortfolioDashboardSummary({
      items: [makeItem({ id: "1" }), makeItem({ id: "2", outcome: "Finished." })],
      fileCountByItemId: new Map(),
      linkedItemIds: new Set(),
      activePlanIds: [],
      evidenceCountByPlanId: new Map(),
    });
    expect(summary.incompleteItemCount).toBe(1);
  });

  it("counts active application plans with zero attached evidence", () => {
    const summary = buildPortfolioDashboardSummary({
      items: [],
      fileCountByItemId: new Map(),
      linkedItemIds: new Set(),
      activePlanIds: ["plan-1", "plan-2", "plan-3"],
      evidenceCountByPlanId: new Map([["plan-1", 2]]),
    });
    expect(summary.applicationsMissingEvidenceCount).toBe(2);
  });

  it("never counts a plan with at least one evidence link as missing evidence", () => {
    const summary = buildPortfolioDashboardSummary({
      items: [],
      fileCountByItemId: new Map(),
      linkedItemIds: new Set(),
      activePlanIds: ["plan-1"],
      evidenceCountByPlanId: new Map([["plan-1", 1]]),
    });
    expect(summary.applicationsMissingEvidenceCount).toBe(0);
  });

  it("includes a profile strength score computed from the same items", () => {
    const summary = buildPortfolioDashboardSummary({
      items: [makeItem()],
      fileCountByItemId: new Map(),
      linkedItemIds: new Set(),
      activePlanIds: [],
      evidenceCountByPlanId: new Map(),
    });
    expect(summary.profileStrength.score).toBeGreaterThanOrEqual(0);
    expect(summary.profileStrength.maxScore).toBeGreaterThan(0);
  });
});

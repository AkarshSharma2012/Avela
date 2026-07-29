import { describe, expect, it } from "vitest";

import { summarizeClaimDimensions } from "@/lib/claims/rollup";
import type { ClaimDimension, ClaimDimensionResult, ClaimDimensionStatus } from "@/types/claims";

function row(dimension: ClaimDimension, status: ClaimDimensionStatus, stale = false): ClaimDimensionResult {
  return {
    id: `${dimension}-id`,
    user_id: "user-1",
    portfolio_item_id: "item-1",
    dimension,
    status,
    stale,
    evidence_ref: {},
    notes: null,
    updated_by_actor_type: "system",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

describe("summarizeClaimDimensions", () => {
  it("returns not_yet_supported for no rows or all-not_checked rows", () => {
    expect(summarizeClaimDimensions([]).level).toBe("not_yet_supported");
    expect(summarizeClaimDimensions([row("identity_control", "not_checked")]).level).toBe("not_yet_supported");
  });

  it("one successful check never verifies the whole entry — a single externally_confirmed dimension among many not_checked ones is not 'strong'", () => {
    const summary = summarizeClaimDimensions([
      row("identity_control", "externally_confirmed"),
      row("impact_or_outcome", "not_checked"),
      row("role", "not_checked"),
      row("authorship_or_contribution", "not_checked"),
    ]);
    expect(summary.level).not.toBe("strong");
    expect(summary.level).toBe("some_support");
  });

  it("is 'strong' only with breadth: at least 3 checked dimensions, and at least half of those strongly_supported or externally_confirmed", () => {
    const summary = summarizeClaimDimensions([
      row("identity_control", "externally_confirmed"),
      row("account_or_asset_control", "externally_confirmed"),
      row("impact_or_outcome", "unable_to_verify"),
      row("role", "partially_supported"),
    ]);
    expect(summary.level).toBe("strong");
    expect(summary.checkedCount).toBe(4);
  });

  it("caps at 'some_support' when fewer than 3 dimensions have been checked at all, no matter how strong they are", () => {
    const summary = summarizeClaimDimensions([
      row("identity_control", "externally_confirmed"),
      row("account_or_asset_control", "externally_confirmed"),
    ]);
    expect(summary.level).toBe("some_support");
  });

  it("is 'some_support' when there is supporting evidence but strong/confirmed statuses are a minority", () => {
    const summary = summarizeClaimDimensions([
      row("identity_control", "partially_supported"),
      row("impact_or_outcome", "unable_to_verify"),
      row("role", "not_checked"),
    ]);
    expect(summary.level).toBe("some_support");
  });

  it("needs_review takes priority over any other computed level", () => {
    const summary = summarizeClaimDimensions([
      row("identity_control", "externally_confirmed"),
      row("account_or_asset_control", "externally_confirmed"),
      row("impact_or_outcome", "needs_review"),
    ]);
    expect(summary.level).toBe("needs_review");
  });

  it("carries the stale flag through per-row so a UI can show 'this changed since it was checked'", () => {
    const summary = summarizeClaimDimensions([row("identity_control", "strongly_supported", true)]);
    expect(summary.rows[0].stale).toBe(true);
  });

  it("rows are sorted by label for stable rendering", () => {
    const summary = summarizeClaimDimensions([row("role", "not_checked"), row("identity_control", "not_checked")]);
    const labels = summary.rows.map((r) => r.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });
});

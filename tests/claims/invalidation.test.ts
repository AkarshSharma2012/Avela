import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/claims/repository", async () => {
  const actual = await vi.importActual<typeof import("@/lib/claims/repository")>("@/lib/claims/repository");
  return {
    ...actual,
    listDimensionsForUser: vi.fn(),
    applyDimensionTransition: vi.fn(),
    markDimensionStale: vi.fn(),
  };
});

import { applyDimensionTransition, listDimensionsForUser, markDimensionStale } from "@/lib/claims/repository";
import { dimensionsAffectedByFields, invalidateDimensionsForMaterialEdit } from "@/lib/claims/invalidation";
import type { ClaimDimensionResult } from "@/types/claims";

const mockListDimensionsForUser = vi.mocked(listDimensionsForUser);
const mockApplyDimensionTransition = vi.mocked(applyDimensionTransition);
const mockMarkDimensionStale = vi.mocked(markDimensionStale);

afterEach(() => {
  vi.clearAllMocks();
});

function row(overrides: Partial<ClaimDimensionResult>): ClaimDimensionResult {
  return {
    id: "row-1",
    user_id: "user-1",
    portfolio_item_id: "item-1",
    dimension: "organization_relationship",
    status: "partially_supported",
    stale: false,
    evidence_ref: {},
    notes: null,
    updated_by_actor_type: "system",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("dimensionsAffectedByFields", () => {
  it("maps each material field to its own narrow set of dimensions", () => {
    expect(dimensionsAffectedByFields(["organization"])).toEqual(["organization_relationship"]);
    expect(dimensionsAffectedByFields(["outcome"])).toEqual(["impact_or_outcome"]);
  });

  it("never lets one changed field invalidate an unrelated dimension", () => {
    expect(dimensionsAffectedByFields(["role"])).not.toContain("impact_or_outcome");
  });

  it("deduplicates when multiple changed fields map to the same dimension", () => {
    expect(dimensionsAffectedByFields(["startDate", "hoursPerWeek", "weeksPerYear"])).toEqual(["dates_and_duration"]);
  });
});

describe("invalidateDimensionsForMaterialEdit", () => {
  it("does nothing when no fields changed", async () => {
    await invalidateDimensionsForMaterialEdit({} as never, "user-1", "item-1", []);
    expect(mockListDimensionsForUser).not.toHaveBeenCalled();
  });

  it("downgrades a strongly_supported/externally_confirmed dimension to unable_to_verify rather than silently keeping stale trust", async () => {
    const strongRow = row({ dimension: "organization_relationship", status: "externally_confirmed" });
    mockListDimensionsForUser.mockResolvedValueOnce(new Map([["item-1", [strongRow]]]));

    await invalidateDimensionsForMaterialEdit({} as never, "user-1", "item-1", ["organization"]);

    expect(mockApplyDimensionTransition).toHaveBeenCalledWith(
      {},
      strongRow,
      expect.objectContaining({ status: "unable_to_verify", actorType: "system", stale: true })
    );
    expect(mockMarkDimensionStale).not.toHaveBeenCalled();
  });

  it("only marks stale (doesn't downgrade) a dimension that wasn't strongly supported to begin with", async () => {
    const partialRow = row({ dimension: "role", status: "partially_supported" });
    mockListDimensionsForUser.mockResolvedValueOnce(new Map([["item-1", [partialRow]]]));

    await invalidateDimensionsForMaterialEdit({} as never, "user-1", "item-1", ["role"]);

    expect(mockMarkDimensionStale).toHaveBeenCalledWith({}, partialRow, expect.stringContaining("role"));
    expect(mockApplyDimensionTransition).not.toHaveBeenCalled();
  });

  it("never touches a dimension unrelated to the changed field", async () => {
    const unrelatedRow = row({ dimension: "impact_or_outcome", status: "externally_confirmed" });
    mockListDimensionsForUser.mockResolvedValueOnce(new Map([["item-1", [unrelatedRow]]]));

    await invalidateDimensionsForMaterialEdit({} as never, "user-1", "item-1", ["role"]);

    expect(mockApplyDimensionTransition).not.toHaveBeenCalled();
    expect(mockMarkDimensionStale).not.toHaveBeenCalled();
  });
});

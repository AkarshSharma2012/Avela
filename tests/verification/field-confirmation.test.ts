import { describe, expect, it } from "vitest";

import { dimensionsForFieldConfirmation } from "@/lib/verification/field-confirmation";

describe("dimensionsForFieldConfirmation", () => {
  it("maps each field to its own narrow set of dimensions, never the whole entry", () => {
    expect(dimensionsForFieldConfirmation("participation", "can_confirm")).toEqual(["project_or_activity_exists", "authorship_or_contribution"]);
    expect(dimensionsForFieldConfirmation("role", "can_confirm")).toEqual(["role"]);
    expect(dimensionsForFieldConfirmation("dates", "can_confirm")).toEqual(["dates_and_duration"]);
    expect(dimensionsForFieldConfirmation("hours", "can_confirm")).toEqual(["dates_and_duration"]);
    expect(dimensionsForFieldConfirmation("outcome", "can_confirm")).toEqual(["impact_or_outcome"]);
  });

  it("confirming one field never supports an unrelated dimension (e.g. dates never touches impact_or_outcome)", () => {
    expect(dimensionsForFieldConfirmation("dates", "can_confirm")).not.toContain("impact_or_outcome");
    expect(dimensionsForFieldConfirmation("role", "can_confirm")).not.toContain("authorship_or_contribution");
  });

  it("returns no dimensions at all when the verifier could not confirm or requested a correction", () => {
    expect(dimensionsForFieldConfirmation("outcome", "cannot_confirm")).toEqual([]);
    expect(dimensionsForFieldConfirmation("role", "needs_correction")).toEqual([]);
  });
});

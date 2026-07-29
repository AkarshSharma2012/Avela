import { describe, expect, it } from "vitest";

import { canTransitionDimensionStatus, listLegalNextDimensionStatuses } from "@/lib/claims/dimension-level";

describe("canTransitionDimensionStatus", () => {
  it("always allows a no-op (from === to) regardless of actor", () => {
    expect(canTransitionDimensionStatus("not_checked", "not_checked", "student")).toBe(true);
    expect(canTransitionDimensionStatus("needs_review", "needs_review", "reviewer")).toBe(true);
  });

  it("a student can only ever self-report partially_supported", () => {
    expect(canTransitionDimensionStatus("not_checked", "partially_supported", "student")).toBe(true);
    expect(canTransitionDimensionStatus("not_checked", "strongly_supported", "student")).toBe(false);
    expect(canTransitionDimensionStatus("not_checked", "externally_confirmed", "student")).toBe(false);
    expect(canTransitionDimensionStatus("not_checked", "needs_review", "student")).toBe(false);
  });

  it("the system can move a dimension through unable_to_verify/partially_supported/strongly_supported/needs_review, never externally_confirmed", () => {
    expect(canTransitionDimensionStatus("not_checked", "strongly_supported", "system")).toBe(true);
    expect(canTransitionDimensionStatus("not_checked", "externally_confirmed", "system")).toBe(false);
  });

  it("a verifier may reach externally_confirmed (a legitimate third party) but never sets not_checked", () => {
    expect(canTransitionDimensionStatus("partially_supported", "externally_confirmed", "verifier")).toBe(true);
    expect(canTransitionDimensionStatus("externally_confirmed", "not_checked", "verifier")).toBe(false);
  });

  it("only a reviewer may move any status to any other status, including resolving needs_review", () => {
    expect(canTransitionDimensionStatus("needs_review", "externally_confirmed", "reviewer")).toBe(true);
    expect(canTransitionDimensionStatus("needs_review", "unable_to_verify", "reviewer")).toBe(true);
  });

  it("nothing ever transitions back to not_checked for any actor", () => {
    for (const actor of ["student", "verifier", "reviewer", "system"] as const) {
      expect(canTransitionDimensionStatus("partially_supported", "not_checked", actor)).toBe(false);
    }
  });
});

describe("listLegalNextDimensionStatuses", () => {
  it("excludes the current status from its own legal-next list", () => {
    expect(listLegalNextDimensionStatuses("partially_supported", "student")).not.toContain("partially_supported");
  });

  it("lists exactly the one status a student may set", () => {
    expect(listLegalNextDimensionStatuses("not_checked", "student")).toEqual(["partially_supported"]);
  });
});

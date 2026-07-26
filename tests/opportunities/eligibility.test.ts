import { describe, expect, it } from "vitest";

import { isGradeEligible } from "@/lib/opportunities/eligibility";

describe("isGradeEligible", () => {
  it("treats an unknown student grade level as eligible for anything", () => {
    expect(isGradeEligible(null, 9, 12)).toBe(true);
    expect(isGradeEligible(null, null, null)).toBe(true);
  });

  it("treats a null min_grade as no lower limit", () => {
    expect(isGradeEligible(6, null, 12)).toBe(true);
  });

  it("treats a null max_grade as no upper limit", () => {
    expect(isGradeEligible(12, 9, null)).toBe(true);
  });

  it("treats both bounds null as open to every grade", () => {
    expect(isGradeEligible(6, null, null)).toBe(true);
    expect(isGradeEligible(12, null, null)).toBe(true);
  });

  it("accepts a grade level within an inclusive range", () => {
    expect(isGradeEligible(9, 9, 12)).toBe(true);
    expect(isGradeEligible(12, 9, 12)).toBe(true);
    expect(isGradeEligible(10, 9, 12)).toBe(true);
  });

  it("rejects a grade level below the minimum", () => {
    expect(isGradeEligible(8, 9, 12)).toBe(false);
  });

  it("rejects a grade level above the maximum", () => {
    expect(isGradeEligible(13, 9, 12)).toBe(false);
  });
});

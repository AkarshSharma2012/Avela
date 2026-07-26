import { describe, expect, it } from "vitest";

import {
  evaluateEligibility,
  type EligibilityOpportunityInput,
  type EligibilityStudentInput,
} from "@/lib/opportunities/eligibility-engine";

function opportunity(overrides: Partial<EligibilityOpportunityInput> = {}): EligibilityOpportunityInput {
  return {
    minGrade: null,
    maxGrade: null,
    deadlineStatus: "open",
    applicationStatus: "accepting_applications",
    residencyRequirements: null,
    citizenshipRequirements: null,
    weeklyCommitmentHours: null,
    ...overrides,
  };
}

function student(overrides: Partial<EligibilityStudentInput> = {}): EligibilityStudentInput {
  return {
    gradeLevel: null,
    state: null,
    weeklyAvailability: null,
    ...overrides,
  };
}

describe("evaluateEligibility — grade", () => {
  it("is ineligible when the student's grade is outside the opportunity's range", () => {
    const result = evaluateEligibility(
      opportunity({ minGrade: 9, maxGrade: 12 }),
      student({ gradeLevel: 7 })
    );
    expect(result.status).toBe("ineligible");
    expect(result.reasons[0]).toMatch(/grade level/i);
  });

  it("is eligible when the student's grade is within range", () => {
    const result = evaluateEligibility(
      opportunity({ minGrade: 9, maxGrade: 12 }),
      student({ gradeLevel: 10 })
    );
    expect(result.status).toBe("eligible");
  });

  it("treats an unknown student grade as eligible for everything", () => {
    const result = evaluateEligibility(opportunity({ minGrade: 9, maxGrade: 12 }), student());
    expect(result.status).toBe("eligible");
  });
});

describe("evaluateEligibility — residency", () => {
  it("is ineligible when the student's state doesn't match a required residency", () => {
    const result = evaluateEligibility(
      opportunity({ residencyRequirements: "Washington" }),
      student({ state: "California" })
    );
    expect(result.status).toBe("ineligible");
    expect(result.reasons[0]).toMatch(/washington residency/i);
  });

  it("is eligible when the student's state matches", () => {
    const result = evaluateEligibility(
      opportunity({ residencyRequirements: "Washington" }),
      student({ state: "Washington" })
    );
    expect(result.status).toBe("eligible");
  });

  it("is unclear (not ineligible) when residency is required but the student's location is unknown", () => {
    const result = evaluateEligibility(
      opportunity({ residencyRequirements: "Washington" }),
      student({ state: null })
    );
    expect(result.status).toBe("unclear");
    expect(result.reasons.some((r) => /add your location/i.test(r))).toBe(true);
  });
});

describe("evaluateEligibility — citizenship", () => {
  it("is capped at unclear (never fully eligible) when a citizenship requirement exists", () => {
    const result = evaluateEligibility(
      opportunity({ citizenshipRequirements: "U.S. citizen" }),
      student({ gradeLevel: 10 })
    );
    expect(result.status).toBe("unclear");
    expect(result.reasons.some((r) => /citizenship requirement is unclear/i.test(r))).toBe(true);
  });

  it("does not downgrade when citizenship requirement text explicitly says none", () => {
    const result = evaluateEligibility(
      opportunity({ citizenshipRequirements: "None" }),
      student({ gradeLevel: 10 })
    );
    expect(result.status).toBe("eligible");
  });
});

describe("evaluateEligibility — deadline/application status", () => {
  it("is ineligible when the deadline has passed", () => {
    const result = evaluateEligibility(opportunity({ deadlineStatus: "closed" }), student());
    expect(result.status).toBe("ineligible");
    expect(result.reasons.some((r) => /deadline has passed/i.test(r))).toBe(true);
  });

  it("is ineligible when applications are explicitly closed", () => {
    const result = evaluateEligibility(opportunity({ applicationStatus: "closed" }), student());
    expect(result.status).toBe("ineligible");
  });
});

describe("evaluateEligibility — weekly commitment", () => {
  it("downgrades to likely_eligible (not ineligible) when commitment exceeds availability", () => {
    const result = evaluateEligibility(
      opportunity({ weeklyCommitmentHours: 15 }),
      student({ weeklyAvailability: "5_to_10" })
    );
    expect(result.status).toBe("likely_eligible");
    expect(result.reasons.some((r) => /exceeds your availability/i.test(r))).toBe(true);
  });

  it("stays eligible when commitment fits availability", () => {
    const result = evaluateEligibility(
      opportunity({ weeklyCommitmentHours: 3 }),
      student({ weeklyAvailability: "5_to_10" })
    );
    expect(result.status).toBe("eligible");
  });
});

describe("evaluateEligibility — always returns at least one reason", () => {
  it("never returns an empty reasons array", () => {
    const result = evaluateEligibility(opportunity(), student());
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});

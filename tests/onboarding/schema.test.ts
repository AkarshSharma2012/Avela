import { describe, expect, it } from "vitest";

import {
  onboardingSchema,
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  step5Schema,
} from "@/lib/onboarding/schema";

const validFull = {
  preferredName: "Jamie",
  gradeLevel: 9,
  city: "Austin",
  state: "TX",
  country: "United States",
  interests: ["Technology"],
  otherInterestText: "",
  goals: ["Explore my interests"],
  preferences: [],
  weeklyAvailability: "2_to_5",
  experienceLevel: "beginner",
  guidedMode: false,
};

describe("step1Schema — basic information", () => {
  it("accepts a complete, valid US student", () => {
    expect(step1Schema.safeParse(validFull).success).toBe(true);
  });

  it("requires a preferred name", () => {
    const result = step1Schema.safeParse({ ...validFull, preferredName: "  " });
    expect(result.success).toBe(false);
  });

  it("requires a grade level", () => {
    const result = step1Schema.safeParse({ ...validFull, gradeLevel: null });
    expect(result.success).toBe(false);
  });

  it("rejects a grade level outside 6-12", () => {
    const result = step1Schema.safeParse({ ...validFull, gradeLevel: 13 });
    expect(result.success).toBe(false);
  });

  it("accepts every grade from 6 to 12", () => {
    for (let grade = 6; grade <= 12; grade += 1) {
      expect(step1Schema.safeParse({ ...validFull, gradeLevel: grade }).success).toBe(
        true
      );
    }
  });

  it("requires city and state for United States students", () => {
    const result = step1Schema.safeParse({ ...validFull, city: "", state: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      expect(fieldErrors.city?.[0]).toMatch(/city/i);
      expect(fieldErrors.state?.[0]).toMatch(/state/i);
    }
  });

  it("does not require city and state for non-US students", () => {
    const result = step1Schema.safeParse({
      ...validFull,
      country: "Canada",
      city: "",
      state: "",
    });
    expect(result.success).toBe(true);
  });

  it("treats the United States check as case-insensitive", () => {
    const result = step1Schema.safeParse({
      ...validFull,
      country: "united states",
      city: "",
      state: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("step2Schema — interests", () => {
  it("requires at least one interest", () => {
    const result = step2Schema.safeParse({ interests: [], otherInterestText: "" });
    expect(result.success).toBe(false);
  });

  it('accepts "Not sure yet" alone as a valid, complete answer', () => {
    const result = step2Schema.safeParse({
      interests: ["Not sure yet"],
      otherInterestText: "",
    });
    expect(result.success).toBe(true);
  });

  it('requires explanatory text when "Other" is selected', () => {
    const result = step2Schema.safeParse({
      interests: ["Other"],
      otherInterestText: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.otherInterestText?.[0]).toBeDefined();
    }
  });

  it('accepts "Other" once explanatory text is provided', () => {
    const result = step2Schema.safeParse({
      interests: ["Other"],
      otherInterestText: "Robotics club",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an interest not in the known list", () => {
    const result = step2Schema.safeParse({
      interests: ["Underwater basket weaving"],
      otherInterestText: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts multiple valid interests", () => {
    const result = step2Schema.safeParse({
      interests: ["Technology", "Biology", "Design"],
      otherInterestText: "",
    });
    expect(result.success).toBe(true);
  });
});

describe("step3Schema — goals", () => {
  it("requires at least one goal", () => {
    expect(step3Schema.safeParse({ goals: [] }).success).toBe(false);
  });

  it("accepts a valid goal selection", () => {
    expect(
      step3Schema.safeParse({ goals: ["Build a resume", "Find an internship"] }).success
    ).toBe(true);
  });

  it("rejects a goal not in the known list", () => {
    expect(step3Schema.safeParse({ goals: ["Take over the world"] }).success).toBe(
      false
    );
  });
});

describe("step4Schema — opportunity preferences", () => {
  it("does not require any selection", () => {
    expect(step4Schema.safeParse({ preferences: [] }).success).toBe(true);
  });

  it("accepts a valid grouped selection", () => {
    const result = step4Schema.safeParse({
      preferences: ["virtual", "free_only", "beginner_friendly"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown preference key", () => {
    expect(step4Schema.safeParse({ preferences: ["telepathic"] }).success).toBe(false);
  });
});

describe("step5Schema — availability, experience, Guided Mode", () => {
  const base = {
    weeklyAvailability: "5_to_10",
    experienceLevel: "some_experience",
    guidedMode: false,
  };

  it("accepts a complete answer", () => {
    expect(step5Schema.safeParse(base).success).toBe(true);
  });

  it("requires weekly availability", () => {
    expect(step5Schema.safeParse({ ...base, weeklyAvailability: null }).success).toBe(
      false
    );
  });

  it("requires experience level", () => {
    expect(step5Schema.safeParse({ ...base, experienceLevel: null }).success).toBe(
      false
    );
  });

  it("accepts Guided Mode enabled or disabled", () => {
    expect(step5Schema.safeParse({ ...base, guidedMode: true }).success).toBe(true);
    expect(step5Schema.safeParse({ ...base, guidedMode: false }).success).toBe(true);
  });
});

describe("onboardingSchema — full submission", () => {
  it("accepts a fully valid payload", () => {
    expect(onboardingSchema.safeParse(validFull).success).toBe(true);
  });

  it("fails when any required step's data is missing", () => {
    expect(onboardingSchema.safeParse({ ...validFull, goals: [] }).success).toBe(false);
    expect(
      onboardingSchema.safeParse({ ...validFull, weeklyAvailability: null }).success
    ).toBe(false);
    expect(
      onboardingSchema.safeParse({ ...validFull, preferredName: "" }).success
    ).toBe(false);
  });

  it("re-checks the US-location rule at final submission", () => {
    const result = onboardingSchema.safeParse({ ...validFull, city: "", state: "" });
    expect(result.success).toBe(false);
  });

  it("re-checks the Other-interest rule at final submission", () => {
    const result = onboardingSchema.safeParse({
      ...validFull,
      interests: ["Other"],
      otherInterestText: "",
    });
    expect(result.success).toBe(false);
  });
});

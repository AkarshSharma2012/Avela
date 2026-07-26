import { describe, expect, it } from "vitest";

import {
  normalizeCitizenshipRequirement,
  normalizeCommitment,
  normalizeCost,
  normalizeDeadline,
  normalizeGradeRange,
  normalizeInterestTags,
  normalizeResidencyRequirement,
  normalizeUrl,
} from "@/lib/opportunities/normalization";

describe("normalizeGradeRange", () => {
  it("parses '9th-12th grade'", () => {
    expect(normalizeGradeRange("9th-12th grade").value).toEqual({ minGrade: 9, maxGrade: 12 });
  });

  it("parses 'grades 9 through 12'", () => {
    expect(normalizeGradeRange("grades 9 through 12").value).toEqual({ minGrade: 9, maxGrade: 12 });
  });

  it("parses 'high school students'", () => {
    expect(normalizeGradeRange("Open to high school students").value).toEqual({
      minGrade: 9,
      maxGrade: 12,
    });
  });

  it("parses 'middle school'", () => {
    expect(normalizeGradeRange("middle school students").value).toEqual({ minGrade: 6, maxGrade: 8 });
  });

  it("parses a single grade", () => {
    expect(normalizeGradeRange("10th grade").value).toEqual({ minGrade: 10, maxGrade: 10 });
  });

  it("returns null with low confidence for unparseable text, preserving the raw input", () => {
    const result = normalizeGradeRange("students with a passion for science");
    expect(result.value).toBeNull();
    expect(result.confidence).toBe("low");
    expect(result.raw).toBe("students with a passion for science");
  });

  it("never invents a range for empty input", () => {
    expect(normalizeGradeRange("").value).toBeNull();
  });
});

describe("normalizeCost", () => {
  it("recognizes 'free'", () => {
    expect(normalizeCost("This program is free").value).toEqual({ costType: "free", costAmount: 0 });
  });

  it("parses a dollar amount", () => {
    expect(normalizeCost("$1,250.50 tuition").value).toEqual({ costType: "paid", costAmount: 1250.5 });
  });

  it("leaves ambiguous cost text unknown rather than guessing", () => {
    const result = normalizeCost("contact us for pricing");
    expect(result.value).toBeNull();
    expect(result.confidence).toBe("low");
  });
});

describe("normalizeDeadline", () => {
  it("parses a month/day/year date to UTC midnight ISO", () => {
    expect(normalizeDeadline("March 15, 2027").value).toBe("2027-03-15T00:00:00.000Z");
  });

  it("parses an ISO-like date", () => {
    expect(normalizeDeadline("2027-03-15").value).toBe("2027-03-15T00:00:00.000Z");
  });

  it("parses a slash date", () => {
    expect(normalizeDeadline("3/15/2027").value).toBe("2027-03-15T00:00:00.000Z");
  });

  it("treats 'rolling admissions' as no exact deadline, not an error", () => {
    const result = normalizeDeadline("Rolling admissions, apply anytime");
    expect(result.value).toBeNull();
    expect(result.confidence).toBe("high");
  });

  it("never invents a date for an impossible calendar day", () => {
    expect(normalizeDeadline("February 30, 2027").value).toBeNull();
  });

  it("returns null for ambiguous relative phrases", () => {
    expect(normalizeDeadline("applications close in two weeks").value).toBeNull();
  });
});

describe("normalizeCommitment", () => {
  it("takes the upper bound of a range", () => {
    expect(normalizeCommitment("5-10 hours per week").value).toBe(10);
  });

  it("parses a single hours figure", () => {
    expect(normalizeCommitment("5 hrs/week").value).toBe(5);
  });

  it("returns null for text with no hours", () => {
    expect(normalizeCommitment("commitment varies").value).toBeNull();
  });
});

describe("normalizeUrl", () => {
  it("accepts a valid https URL", () => {
    expect(normalizeUrl("https://example.org/apply").value).toBe("https://example.org/apply");
  });

  it("rejects a non-http(s) protocol", () => {
    expect(normalizeUrl("javascript:alert(1)").value).toBeNull();
  });

  it("rejects unparseable text", () => {
    expect(normalizeUrl("not a url").value).toBeNull();
  });
});

describe("normalizeInterestTags", () => {
  const KNOWN = ["Computer Science", "Biology", "Design"];

  it("matches known tags case-insensitively", () => {
    const result = normalizeInterestTags(["computer science", "Biology"], KNOWN);
    expect(result.value).toEqual(["Computer Science", "Biology"]);
    expect(result.confidence).toBe("high");
  });

  it("drops unmatched tags rather than guessing, and flags low confidence", () => {
    const result = normalizeInterestTags(["Biology", "Astrology"], KNOWN);
    expect(result.value).toEqual(["Biology"]);
    expect(result.confidence).toBe("low");
  });
});

describe("normalizeResidencyRequirement", () => {
  it("extracts a state name from 'Washington residents'", () => {
    expect(normalizeResidencyRequirement("Open to Washington residents only").value).toBe("Washington");
  });

  it("recognizes US-wide residency", () => {
    expect(normalizeResidencyRequirement("Must be a U.S. resident").value).toBe("United States");
  });

  it("returns null for text with no residency signal", () => {
    expect(normalizeResidencyRequirement("Open to all students").value).toBeNull();
  });

  it("extracts a state name even when 'Residents' is capitalized as a bullet heading (regression: NASA's real eligibility list reads 'Texas Residents')", () => {
    expect(normalizeResidencyRequirement("U.S. Citizens, Texas Residents").value).toBe("Texas");
  });
});

describe("normalizeCitizenshipRequirement", () => {
  it("recognizes an explicit citizenship requirement", () => {
    expect(normalizeCitizenshipRequirement("Applicants must be a US citizen").value).toBe(
      "U.S. citizen"
    );
  });

  it("recognizes explicitly no citizenship requirement", () => {
    expect(normalizeCitizenshipRequirement("Open to international students").value).toBe("None");
  });

  it("returns null when nothing is mentioned", () => {
    expect(normalizeCitizenshipRequirement("A great summer program").value).toBeNull();
  });
});

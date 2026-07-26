import { describe, expect, it } from "vitest";

import {
  extractAgeRange,
  extractApplicationContact,
  extractDetailFields,
  extractEssayRequired,
  extractFinancialAidAvailable,
  extractHourlyPay,
  extractInterviewRequired,
  extractParentConsentRequired,
  extractRecommendationRequired,
  extractRequiredDocuments,
  extractSchoolEnrollmentRequired,
  extractStipendAmount,
  extractTranscriptRequired,
} from "@/lib/opportunities/detail-extraction";

describe("extractAgeRange", () => {
  it("parses an explicit age range", () => {
    const result = extractAgeRange("Open to students ages 14-18 who are interested in science.");
    expect(result.value).toEqual({ minAge: 14, maxAge: 18 });
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("parses a minimum-age-only phrase", () => {
    const result = extractAgeRange("Applicants must be age 16 or older.");
    expect(result.value).toEqual({ minAge: 16, maxAge: null });
  });

  it("returns null when no age text is present", () => {
    const result = extractAgeRange("Open to high school students.");
    expect(result.value).toBeNull();
  });
});

describe("application requirement extractors", () => {
  it("detects an essay requirement", () => {
    expect(extractEssayRequired("Applicants must submit a personal statement.").value).toBe(true);
    expect(extractEssayRequired("A short essay is part of the application.").value).toBe(true);
  });

  it("returns null (not false) when no essay phrase is present", () => {
    expect(extractEssayRequired("Just fill out the form.").value).toBeNull();
  });

  it("detects a recommendation-letter requirement", () => {
    expect(extractRecommendationRequired("Please include two letters of recommendation.").value).toBe(true);
  });

  it("detects a transcript requirement", () => {
    expect(extractTranscriptRequired("Submit an official transcript with your application.").value).toBe(true);
  });

  it("detects an interview requirement", () => {
    expect(extractInterviewRequired("Selected finalists will be interviewed by program staff.").value).toBe(true);
  });

  it("detects a parent-consent requirement", () => {
    expect(extractParentConsentRequired("This form must be signed by a parent or guardian.").value).toBe(true);
  });

  it("detects a school-enrollment requirement", () => {
    expect(
      extractSchoolEnrollmentRequired("Applicants must be currently enrolled in a high school.").value
    ).toBe(true);
  });
});

describe("extractApplicationContact", () => {
  it("finds an email address", () => {
    const result = extractApplicationContact("Questions? Email us at programs@example.org for help.");
    expect(result.value).toBe("programs@example.org");
  });

  it("returns null when no email is present", () => {
    expect(extractApplicationContact("Call our office for more information.").value).toBeNull();
  });
});

describe("extractHourlyPay / extractStipendAmount", () => {
  it("parses an hourly rate", () => {
    expect(extractHourlyPay("Participants are paid $15/hour for their work.").value).toBe(15);
    expect(extractHourlyPay("Pay is $16.50 per hour.").value).toBe(16.5);
  });

  it("parses a stipend amount", () => {
    expect(extractStipendAmount("Students receive a stipend of $500 for the summer.").value).toBe(500);
  });

  it("never fabricates an amount when none is stated", () => {
    expect(extractHourlyPay("This is an unpaid internship.").value).toBeNull();
    expect(extractStipendAmount("This is an unpaid internship.").value).toBeNull();
  });
});

describe("extractFinancialAidAvailable", () => {
  it("detects financial-aid language", () => {
    expect(extractFinancialAidAvailable("Financial aid is available for eligible students.").value).toBe(true);
  });
});

describe("extractRequiredDocuments", () => {
  it("collects every matched document keyword, deduplicated", () => {
    const result = extractRequiredDocuments(
      "Please submit an official transcript, a resume, and a letter of recommendation."
    );
    expect(result.value).toEqual(
      expect.arrayContaining(["Official transcript", "Resume", "Letter of recommendation"])
    );
  });

  it("returns null when no document keywords are found", () => {
    expect(extractRequiredDocuments("Just fill out the online form.").value).toBeNull();
  });
});

describe("extractDetailFields", () => {
  it("omits every field that found nothing, rather than storing a fabricated null-value entry", () => {
    const result = extractDetailFields("Open to high school students. Free program.");
    expect(Object.keys(result)).not.toContain("essay_required");
    expect(Object.keys(result)).not.toContain("hourly_pay");
  });

  it("includes every field that found real evidence, each carrying confidence/evidence/method", () => {
    const result = extractDetailFields(
      "Applicants ages 14-18 must submit an official transcript and a personal statement. Contact us at apply@example.org. A stipend of $500 is provided."
    );
    expect(result.age_range?.value).toEqual({ minAge: 14, maxAge: 18 });
    expect(result.essay_required?.value).toBe(true);
    expect(result.application_contact?.value).toBe("apply@example.org");
    expect(result.stipend_amount?.value).toBe(500);
    for (const field of Object.values(result)) {
      expect(field?.evidence.length).toBeGreaterThan(0);
      expect(field?.method).toBeTruthy();
      expect(typeof field?.confidence).toBe("number");
    }
  });
});

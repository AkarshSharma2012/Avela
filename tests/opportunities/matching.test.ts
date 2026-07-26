import { describe, expect, it } from "vitest";

import { buildMatchProfileInput, matchOpportunity, type MatchProfileInput } from "@/lib/opportunities/matching";
import type { OnboardingSummary } from "@/lib/onboarding/dal";
import type { Opportunity } from "@/types/opportunity";
import type { Profile } from "@/types/profile";

function makeOpportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    title: "Sample Opportunity",
    organization: "Sample Org",
    description: "A sample opportunity for testing.",
    opportunity_type: "internship",
    format: "virtual",
    location_text: null,
    remote_allowed: true,
    min_grade: 9,
    max_grade: 12,
    cost_type: "free",
    cost_amount: null,
    interest_tags: ["Technology"],
    application_deadline: null,
    start_date: null,
    end_date: null,
    weekly_commitment_hours: 5,
    duration_text: null,
    application_url: "https://example.org/apply",
    source_url: null,
    image_url: null,
    is_active: true,
    is_verified: false,
    is_sample: true,
    canonical_url: null,
    source_id: null,
    last_verified_at: null,
    next_verification_at: null,
    verification_status: "unverified",
    verification_confidence: 0,
    deadline_status: "unknown",
    eligibility_status: "undefined",
    application_status: "unknown",
    source_last_modified_at: null,
    first_seen_at: "2026-01-01T00:00:00Z",
    last_seen_at: "2026-01-01T00:00:00Z",
    rejection_reason: null,
    residency_requirements: null,
    citizenship_requirements: null,
    eligibility_notes: null,
    application_cycle: null,
    recurrence_pattern: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeProfileInput(overrides: Partial<MatchProfileInput> = {}): MatchProfileInput {
  return {
    gradeLevel: null,
    city: null,
    state: null,
    weeklyAvailability: null,
    experienceLevel: null,
    interests: [],
    goals: [],
    preferences: [],
    ...overrides,
  };
}

describe("matchOpportunity", () => {
  it("is always limited_fit when the student's grade is outside the opportunity's range, regardless of other overlap", () => {
    const opportunity = makeOpportunity({ min_grade: 9, max_grade: 12, interest_tags: ["Technology"] });
    const profile = makeProfileInput({
      gradeLevel: 8,
      interests: ["Technology"],
      goals: ["Find an internship"],
      preferences: ["virtual", "free_only"],
      weeklyAvailability: "more_than_10",
    });

    const result = matchOpportunity(opportunity, profile);

    expect(result.tier).toBe("limited_fit");
    expect(result.reasons[0]).toMatch(/outside your grade level/i);
  });

  it("falls back to possible_fit with a neutral reason when the profile has no comparable data", () => {
    const opportunity = makeOpportunity({ min_grade: null, max_grade: null, interest_tags: [] });
    const profile = makeProfileInput();

    const result = matchOpportunity(opportunity, profile);

    expect(result.tier).toBe("possible_fit");
    expect(result.reasons).toHaveLength(1);
  });

  it("is strong_fit when grade, interest, goal, format, and availability all line up", () => {
    const opportunity = makeOpportunity({
      opportunity_type: "internship",
      format: "virtual",
      interest_tags: ["Technology", "Computer Science"],
      weekly_commitment_hours: 4,
      min_grade: 9,
      max_grade: 12,
    });
    const profile = makeProfileInput({
      gradeLevel: 10,
      interests: ["Technology"],
      goals: ["Find an internship"],
      preferences: ["virtual"],
      weeklyAvailability: "5_to_10",
    });

    const result = matchOpportunity(opportunity, profile);

    expect(result.tier).toBe("strong_fit");
    expect(result.reasons.some((reason) => reason.includes("Technology"))).toBe(true);
    expect(result.reasons.some((reason) => /goal to find an internship/i.test(reason))).toBe(true);
  });

  it("is possible_fit with exactly one net positive signal", () => {
    const opportunity = makeOpportunity({
      interest_tags: ["Business"],
      min_grade: null,
      max_grade: null,
      weekly_commitment_hours: null,
    });
    const profile = makeProfileInput({ interests: ["Business"] });

    const result = matchOpportunity(opportunity, profile);

    expect(result.tier).toBe("possible_fit");
  });

  it("counts a cost mismatch (free_only preference, paid opportunity) as a negative signal", () => {
    const opportunity = makeOpportunity({
      cost_type: "paid",
      cost_amount: 300,
      min_grade: null,
      max_grade: null,
      interest_tags: [],
      weekly_commitment_hours: null,
    });
    const profile = makeProfileInput({ preferences: ["free_only"] });

    const result = matchOpportunity(opportunity, profile);

    expect(result.tier).toBe("limited_fit");
    expect(result.reasons[0]).toMatch(/costs money/i);
  });

  it("counts a weekly commitment that exceeds availability as a negative signal", () => {
    const opportunity = makeOpportunity({
      weekly_commitment_hours: 20,
      min_grade: null,
      max_grade: null,
      interest_tags: [],
    });
    const profile = makeProfileInput({ weeklyAvailability: "less_than_2" });

    const result = matchOpportunity(opportunity, profile);

    expect(result.tier).toBe("limited_fit");
    expect(result.reasons[0]).toMatch(/more time than your weekly availability/i);
  });

  it("treats 'varies'/'not_sure' availability as unknown, not a mismatch", () => {
    const opportunity = makeOpportunity({
      weekly_commitment_hours: 20,
      min_grade: null,
      max_grade: null,
      interest_tags: [],
    });
    const profile = makeProfileInput({ weeklyAvailability: "varies" });

    const result = matchOpportunity(opportunity, profile);

    expect(result.reasons.every((reason) => !/weekly availability/i.test(reason))).toBe(true);
  });

  it("never mentions a percentage or score in any reason", () => {
    const opportunity = makeOpportunity({ interest_tags: ["Technology"] });
    const profile = makeProfileInput({ interests: ["Technology"], gradeLevel: 10 });

    const result = matchOpportunity(opportunity, profile);

    for (const reason of result.reasons) {
      expect(reason).not.toMatch(/%|\bscore\b/i);
    }
  });
});

describe("buildMatchProfileInput", () => {
  it("maps a profile row and onboarding summary into the shape matchOpportunity reads", () => {
    const profile = {
      id: "u1",
      email: "student@example.com",
      display_name: "Jamie",
      grade_level: 10,
      city: "Austin",
      state: "TX",
      country: "United States",
      weekly_availability: "2_to_5",
      experience_level: "beginner",
      guided_mode: false,
      onboarding_version: 1,
      onboarding_completed: true,
      onboarding_completed_at: "2026-01-01T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    } satisfies Profile;

    const summary: OnboardingSummary = {
      interests: ["Technology"],
      otherInterestText: null,
      goals: ["Find an internship"],
      preferences: ["virtual"],
    };

    const input = buildMatchProfileInput(profile, summary);

    expect(input).toEqual({
      gradeLevel: 10,
      city: "Austin",
      state: "TX",
      weeklyAvailability: "2_to_5",
      experienceLevel: "beginner",
      interests: ["Technology"],
      goals: ["Find an internship"],
      preferences: ["virtual"],
    });
  });
});

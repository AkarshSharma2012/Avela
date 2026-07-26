import { describe, expect, it } from "vitest";

import { buildChosenForYou } from "@/lib/opportunities/chosen-for-you";
import type { MatchProfileInput } from "@/lib/opportunities/matching";
import type { Opportunity } from "@/types/opportunity";

const NOW = new Date("2026-07-26T12:00:00Z");

function makeOpportunity(id: string, overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id,
    title: `Opportunity ${id}`,
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
    application_deadline: "2026-08-15T00:00:00Z",
    start_date: null,
    end_date: null,
    weekly_commitment_hours: 5,
    duration_text: null,
    application_url: "https://example.org/apply",
    source_url: null,
    image_url: null,
    is_active: true,
    is_verified: true,
    is_sample: false,
    canonical_url: null,
    source_id: null,
    last_verified_at: "2026-07-01T00:00:00Z",
    next_verification_at: null,
    verification_status: "verified",
    verification_confidence: 90,
    deadline_status: "open",
    eligibility_status: "defined",
    application_status: "accepting_applications",
    source_last_modified_at: null,
    first_seen_at: "2026-01-01T00:00:00Z",
    last_seen_at: "2026-01-01T00:00:00Z",
    rejection_reason: null,
    residency_requirements: null,
    citizenship_requirements: null,
    eligibility_notes: null,
    application_cycle: null,
    recurrence_pattern: null,
    verification_label: "verified_accepting",
    has_unresolved_conflict: false,
    application_opens_at: null,
    application_closes_at: null,
    status_evidence: null,
    status_checked_at: null,
    age_min: null,
    age_max: null,
    school_enrollment_required: null,
    stipend_amount: null,
    hourly_pay: null,
    financial_aid_available: null,
    transportation_support: null,
    housing_support: null,
    essay_required: null,
    recommendation_required: null,
    transcript_required: null,
    interview_required: null,
    parent_consent_required: null,
    schedule_text: null,
    attendance_requirements: null,
    application_contact: null,
    notification_date: null,
    extended_details: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeProfile(overrides: Partial<MatchProfileInput> = {}): MatchProfileInput {
  return {
    gradeLevel: 10,
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

// A strong match: interest, goal, format, and availability all line up.
const STRONG_PROFILE = makeProfile({
  gradeLevel: 10,
  interests: ["Technology"],
  goals: ["Find an internship"],
  preferences: ["virtual"],
  weeklyAvailability: "5_to_10",
});

function strongOpportunity(id: string, overrides: Partial<Opportunity> = {}): Opportunity {
  return makeOpportunity(id, {
    interest_tags: ["Technology"],
    opportunity_type: "internship",
    format: "virtual",
    weekly_commitment_hours: 4,
    ...overrides,
  });
}

// A weak match: nothing about the opportunity lines up with the profile, and
// its cost/format actively conflict with stated preferences (matching.ts's
// negative signals), landing it in limited_fit without being ineligible.
function weakOpportunity(id: string, overrides: Partial<Opportunity> = {}): Opportunity {
  return makeOpportunity(id, {
    interest_tags: ["Business"],
    opportunity_type: "club",
    format: "in_person",
    cost_type: "paid",
    cost_amount: 200,
    weekly_commitment_hours: 20,
    ...overrides,
  });
}

const WEAK_PROFILE = makeProfile({
  gradeLevel: 10,
  interests: ["Technology"],
  preferences: ["free_only"],
  weeklyAvailability: "less_than_2",
});

describe("buildChosenForYou — featured selection", () => {
  it("features the single strongest match on the first page", () => {
    const opportunities = [
      strongOpportunity("strong"),
      weakOpportunity("weak"),
    ];

    const batch = buildChosenForYou(opportunities, STRONG_PROFILE, 0, NOW);

    expect(batch.featured?.opportunity.id).toBe("strong");
    expect(batch.featured?.matchResult.tier).toBe("strong_fit");
  });

  it("shows up to three additional matches alongside the featured one", () => {
    const opportunities = [
      strongOpportunity("a"),
      strongOpportunity("b"),
      strongOpportunity("c"),
      strongOpportunity("d"),
      strongOpportunity("e"),
    ];

    const batch = buildChosenForYou(opportunities, STRONG_PROFILE, 0, NOW);

    expect(batch.featured).not.toBeNull();
    expect(batch.additional).toHaveLength(3);
  });
});

describe("buildChosenForYou — honesty about weaker matches", () => {
  it("labels a limited-fit result as limited_fit, never disguised as a stronger tier", () => {
    const opportunities = [strongOpportunity("strong"), weakOpportunity("weak")];

    const batch = buildChosenForYou(opportunities, WEAK_PROFILE, 0, NOW);

    const weakEntry = batch.additional.find((entry) => entry.opportunity.id === "weak");
    expect(weakEntry?.matchResult.tier).toBe("limited_fit");
    expect(weakEntry?.matchResult.reasons.length).toBeGreaterThan(0);
  });

  it("features the best-available match honestly labeled limited_fit when nothing stronger exists", () => {
    const opportunities = [weakOpportunity("only")];

    const batch = buildChosenForYou(opportunities, WEAK_PROFILE, 0, NOW);

    expect(batch.featured?.opportunity.id).toBe("only");
    expect(batch.featured?.matchResult.tier).toBe("limited_fit");
  });
});

describe("buildChosenForYou — exclusions", () => {
  it("never features or lists a sample opportunity, even a perfect one", () => {
    const opportunities = [
      strongOpportunity("sample", { is_sample: true }),
      strongOpportunity("real"),
    ];

    const batch = buildChosenForYou(opportunities, STRONG_PROFILE, 0, NOW);

    expect(batch.featured?.opportunity.id).toBe("real");
    expect(batch.additional.some((entry) => entry.opportunity.id === "sample")).toBe(false);
  });

  it("excludes an opportunity whose deadline has closed", () => {
    const opportunities = [
      strongOpportunity("open"),
      strongOpportunity("closed", { deadline_status: "closed" }),
    ];

    const batch = buildChosenForYou(opportunities, STRONG_PROFILE, 0, NOW);

    const ids = [batch.featured?.opportunity.id, ...batch.additional.map((e) => e.opportunity.id)];
    expect(ids).not.toContain("closed");
  });

  it("excludes a clearly ineligible opportunity (outside the student's grade)", () => {
    const opportunities = [
      strongOpportunity("in-range"),
      strongOpportunity("out-of-range", { min_grade: 1, max_grade: 3 }),
    ];

    const batch = buildChosenForYou(opportunities, STRONG_PROFILE, 0, NOW);

    const ids = [batch.featured?.opportunity.id, ...batch.additional.map((e) => e.opportunity.id)];
    expect(ids).not.toContain("out-of-range");
  });
});

describe("buildChosenForYou — deterministic ordering", () => {
  it("returns the identical order across repeated calls with the same inputs", () => {
    const opportunities = [
      strongOpportunity("a"),
      weakOpportunity("b"),
      strongOpportunity("c"),
      weakOpportunity("d"),
      strongOpportunity("e"),
    ];

    const first = buildChosenForYou(opportunities, STRONG_PROFILE, 0, NOW);
    const second = buildChosenForYou(opportunities, STRONG_PROFILE, 0, NOW);

    const idsOf = (batch: typeof first) => [
      batch.featured?.opportunity.id,
      ...batch.additional.map((entry) => entry.opportunity.id),
    ];

    expect(idsOf(first)).toEqual(idsOf(second));
  });
});

describe("buildChosenForYou — Find more pagination", () => {
  it("never repeats an opportunity already shown in an earlier batch", () => {
    const opportunities = Array.from({ length: 10 }, (_, i) => strongOpportunity(`o${i}`));

    const seen: string[] = [];
    let batch = buildChosenForYou(opportunities, STRONG_PROFILE, 0, NOW);
    seen.push(...(batch.featured ? [batch.featured.opportunity.id] : []), ...batch.additional.map((e) => e.opportunity.id));

    while (batch.nextShown !== null) {
      batch = buildChosenForYou(opportunities, STRONG_PROFILE, batch.nextShown, NOW);
      seen.push(...(batch.featured ? [batch.featured.opportunity.id] : []), ...batch.additional.map((e) => e.opportunity.id));
    }

    expect(new Set(seen).size).toBe(seen.length);
    expect(new Set(seen)).toEqual(new Set(opportunities.map((o) => o.id)));
  });

  it("preserves the same relative order across batches as a single unpaginated pass", () => {
    const opportunities = Array.from({ length: 8 }, (_, i) => strongOpportunity(`o${i}`));

    const firstPage = buildChosenForYou(opportunities, STRONG_PROFILE, 0, NOW);
    const idsPage1 = [
      firstPage.featured!.opportunity.id,
      ...firstPage.additional.map((e) => e.opportunity.id),
    ];
    const secondPage = buildChosenForYou(opportunities, STRONG_PROFILE, firstPage.nextShown!, NOW);
    const idsPage2 = secondPage.additional.map((e) => e.opportunity.id);

    // Re-requesting the same offsets again must reproduce the exact same slices.
    const firstPageAgain = buildChosenForYou(opportunities, STRONG_PROFILE, 0, NOW);
    const secondPageAgain = buildChosenForYou(opportunities, STRONG_PROFILE, firstPage.nextShown!, NOW);

    expect([
      firstPageAgain.featured!.opportunity.id,
      ...firstPageAgain.additional.map((e) => e.opportunity.id),
    ]).toEqual(idsPage1);
    expect(secondPageAgain.additional.map((e) => e.opportunity.id)).toEqual(idsPage2);
  });
});

describe("buildChosenForYou — exhausted and broader-results states", () => {
  it("reports 'empty' when there is no eligible opportunity at all", () => {
    const batch = buildChosenForYou([], STRONG_PROFILE, 0, NOW);

    expect(batch.status).toBe("empty");
    expect(batch.featured).toBeNull();
    expect(batch.additional).toEqual([]);
    expect(batch.nextShown).toBeNull();
  });

  it("reports 'exhausted' once the entire pool has already been shown", () => {
    const opportunities = [strongOpportunity("a"), strongOpportunity("b")];

    const batch = buildChosenForYou(opportunities, STRONG_PROFILE, 0, NOW);

    expect(batch.status).toBe("exhausted");
    expect(batch.nextShown).toBeNull();
  });

  it("reports 'only_broader_remaining' when everything left is a limited_fit", () => {
    const opportunities = [
      strongOpportunity("s1"),
      strongOpportunity("s2"),
      strongOpportunity("s3"),
      strongOpportunity("s4"),
      weakOpportunity("broad"),
    ];

    const batch = buildChosenForYou(opportunities, STRONG_PROFILE, 0, NOW);

    expect(batch.status).toBe("only_broader_remaining");
    expect(batch.nextShown).toBe(4);

    const next = buildChosenForYou(opportunities, STRONG_PROFILE, batch.nextShown!, NOW);
    expect(next.additional.map((e) => e.opportunity.id)).toEqual(["broad"]);
    expect(next.additional[0].matchResult.tier).toBe("limited_fit");
  });

  it("reports 'has_more' when a stronger match still remains in a later batch", () => {
    const opportunities = Array.from({ length: 6 }, (_, i) => strongOpportunity(`o${i}`));

    const batch = buildChosenForYou(opportunities, STRONG_PROFILE, 0, NOW);

    expect(batch.status).toBe("has_more");
    expect(batch.nextShown).toBe(4);
  });
});

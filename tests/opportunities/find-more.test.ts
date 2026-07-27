import { describe, expect, it, vi } from "vitest";

import type { DiscoveryCandidate, DiscoveryRepository } from "@/lib/opportunities/discovery";
import {
  findMoreOpportunities,
  MAX_DISCOVERY_RUNS_PER_HOUR,
  type FindMoreDependencies,
  type RecommendationInsert,
} from "@/lib/opportunities/find-more";
import type { MatchProfileInput } from "@/lib/opportunities/matching";
import type { Opportunity } from "@/types/opportunity";

const NOW = new Date("2026-07-27T12:00:00Z");

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
    gradeLevel: 11,
    city: null,
    state: null,
    weeklyAvailability: null,
    experienceLevel: null,
    interests: ["Technology"],
    goals: [],
    preferences: [],
    ...overrides,
  };
}

/** Everything findMoreOpportunities needs, with sane no-op defaults — each test overrides only what it exercises. */
function makeDeps(overrides: Partial<FindMoreDependencies> = {}): FindMoreDependencies {
  const inserted: RecommendationInsert[] = [];
  return {
    userId: "user-1",
    profile: makeProfile(),
    alreadyShownOpportunityIds: new Set(),
    batchNumber: 1,
    now: NOW,
    listCatalogPool: async () => [],
    countRecentDiscoveryRuns: async () => 0,
    hasActiveDiscoveryRun: async () => false,
    createDiscoveryRun: async () => "run-1",
    updateDiscoveryRunStatus: async () => {},
    completeDiscoveryRun: async () => {},
    insertRecommendations: async (rows) => {
      inserted.push(...rows);
    },
    discoveryRepository: {} as DiscoveryRepository,
    ...overrides,
  };
}

function makeCandidate(id: string, tier: DiscoveryCandidate["tier"] = "strong_fit"): DiscoveryCandidate {
  return {
    opportunity: makeOpportunity(id),
    matchResult: { tier, reasons: ["Matches your interests"] },
    eligibilityResult: { status: "eligible", reasons: ["Meets grade requirements"] },
    tier,
  };
}

describe("findMoreOpportunities", () => {
  it("serves the catalog alone and never touches discovery when enough useful matches remain", async () => {
    const pool = [makeOpportunity("a"), makeOpportunity("b"), makeOpportunity("c")];
    const countRecentDiscoveryRuns = vi.fn(async () => 0);

    const result = await findMoreOpportunities(
      makeDeps({ listCatalogPool: async () => pool, countRecentDiscoveryRuns })
    );

    expect(result.usedDiscovery).toBe(false);
    expect(result.status).toBe("ok");
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(countRecentDiscoveryRuns).not.toHaveBeenCalled();
  });

  it("falls back to fresh discovery when fewer than the minimum useful catalog matches remain", async () => {
    const runFreshDiscoveryImpl = vi.fn(async () => ({
      candidates: [makeCandidate("fresh-1")],
      sourceOutcomes: [{ sourceKey: "nist-ship" as const, sourceName: "NIST", status: "ingested" as const, itemsFound: 1, newOpportunityIds: ["fresh-1"], errorSummary: null }],
      sourcesAttempted: ["nist-ship" as const],
      allSourcesFailed: false,
      anySourceFailed: false,
    }));

    const result = await findMoreOpportunities(
      makeDeps({
        listCatalogPool: async () => [],
        runFreshDiscoveryImpl,
      })
    );

    expect(runFreshDiscoveryImpl).toHaveBeenCalledTimes(1);
    expect(result.usedDiscovery).toBe(true);
    expect(result.discoveryRunId).toBe("run-1");
    expect(result.recommendations.map((c) => c.opportunity.id)).toContain("fresh-1");
    expect(result.status).toBe("ok");
  });

  it("blocks a new run when the hourly rate limit is already hit, but still returns any catalog fallback", async () => {
    const result = await findMoreOpportunities(
      makeDeps({
        listCatalogPool: async () => [],
        countRecentDiscoveryRuns: async () => MAX_DISCOVERY_RUNS_PER_HOUR,
      })
    );

    expect(result.status).toBe("rate_limited");
    expect(result.usedDiscovery).toBe(false);
    expect(result.discoveryRunId).toBeNull();
  });

  it("blocks a new run when the student already has one in flight", async () => {
    const result = await findMoreOpportunities(
      makeDeps({
        listCatalogPool: async () => [],
        hasActiveDiscoveryRun: async () => true,
      })
    );

    expect(result.status).toBe("concurrent_run_blocked");
    expect(result.usedDiscovery).toBe(false);
  });

  it("reports source_failure_total when every discovery source fails and no catalog fallback exists", async () => {
    const runFreshDiscoveryImpl = vi.fn(async () => ({
      candidates: [],
      sourceOutcomes: [{ sourceKey: "nist-ship" as const, sourceName: "NIST", status: "failed" as const, itemsFound: 0, newOpportunityIds: [], errorSummary: "network error" }],
      sourcesAttempted: ["nist-ship" as const],
      allSourcesFailed: true,
      anySourceFailed: true,
    }));

    const result = await findMoreOpportunities(
      makeDeps({ listCatalogPool: async () => [], runFreshDiscoveryImpl })
    );

    expect(result.status).toBe("source_failure_total");
    expect(result.recommendations).toHaveLength(0);
  });

  it("persists recommendations exactly once per opportunity and never repeats an already-shown id", async () => {
    const inserted: RecommendationInsert[] = [];
    const pool = [makeOpportunity("a"), makeOpportunity("b"), makeOpportunity("c")];

    await findMoreOpportunities(
      makeDeps({
        listCatalogPool: async () => pool,
        alreadyShownOpportunityIds: new Set(["a"]),
        insertRecommendations: async (rows) => {
          inserted.push(...rows);
        },
      })
    );

    expect(inserted.some((r) => r.opportunityId === "a")).toBe(false);
  });
});

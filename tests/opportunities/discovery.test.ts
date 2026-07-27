import { describe, expect, it, vi } from "vitest";

import type { DiscoverySourceDefinition, DiscoverySourceKey } from "@/lib/opportunities/discovery-sources";
import {
  applyVerificationGate,
  runFreshDiscovery,
  type DiscoveryRepository,
} from "@/lib/opportunities/discovery";
import type { IngestionRunSummary } from "@/lib/opportunities/ingestion-runner";
import type { MatchProfileInput } from "@/lib/opportunities/matching";
import type { Opportunity } from "@/types/opportunity";

const NOW = new Date("2026-07-27T12:00:00Z");
const SILENT_LOGGER = { info: () => {}, warn: () => {}, error: () => {} };

function makeSource(overrides: Partial<DiscoverySourceDefinition> = {}): DiscoverySourceDefinition {
  return {
    key: "nist-ship" as DiscoverySourceKey,
    name: "NIST SHIP",
    baseUrl: "https://www.nist.gov/ship",
    sourceType: "government",
    trustLevel: "high",
    crawlMethod: "html_scrape",
    requiresJavascript: false,
    organizationHint: "NIST",
    defaultOpportunityType: "internship",
    defaultFormat: "in_person",
    createAdapter: () => ({ sourceId: "src-1", discover: async () => [], fetchDetails: async () => {
      throw new Error("not used in tests");
    } }),
    interestTags: ["Technology"],
    relevantTypes: ["internship"],
    stateRestriction: null,
    ...overrides,
  };
}

function makeOpportunity(id: string, overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id,
    title: `Opportunity ${id}`,
    organization: "Sample Org",
    description: "A sample opportunity for testing.",
    opportunity_type: "internship",
    format: "in_person",
    location_text: null,
    remote_allowed: false,
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
    source_id: "src-1",
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

function summary(overrides: Partial<IngestionRunSummary> = {}): IngestionRunSummary {
  return {
    sourceId: "src-1",
    dryRun: false,
    status: "completed",
    itemsFound: 1,
    itemsCreated: 1,
    itemsUpdated: 0,
    itemsRejected: 0,
    itemsQueued: 0,
    errorSummary: null,
    records: [
      {
        sourceUrl: "https://example.org/apply",
        title: "Opportunity opp-1",
        action: "inserted",
        opportunityId: "opp-1",
        rejectionReason: null,
        queuedReasons: [],
      },
    ],
    ...overrides,
  };
}

class FakeDiscoveryRepository implements DiscoveryRepository {
  ingestion = {} as DiscoveryRepository["ingestion"];
  opportunities = new Map<string, Opportunity>();
  freshBySource = new Map<string, Opportunity[]>();

  async resolveSourceId(source: DiscoverySourceDefinition): Promise<string> {
    return `resolved-${source.key}`;
  }

  async getFreshOpportunities(sourceId: string): Promise<Opportunity[]> {
    return this.freshBySource.get(sourceId) ?? [];
  }

  async getOpportunitiesByIds(ids: readonly string[]): Promise<Opportunity[]> {
    return ids.map((id) => this.opportunities.get(id)).filter((o): o is Opportunity => Boolean(o));
  }
}

describe("applyVerificationGate", () => {
  it("downgrades a strong_fit match without good verification evidence", () => {
    expect(applyVerificationGate("strong_fit", "needs_review")).toBe("possible_fit");
  });

  it("keeps a strong_fit match when verification evidence backs it", () => {
    expect(applyVerificationGate("strong_fit", "verified_accepting")).toBe("strong_fit");
  });

  it("never upgrades a weaker tier", () => {
    expect(applyVerificationGate("possible_fit", "verified_accepting")).toBe("possible_fit");
    expect(applyVerificationGate("limited_fit", "verified_accepting")).toBe("limited_fit");
  });
});

describe("runFreshDiscovery", () => {
  it("runs ingestion per selected source and returns ranked, verification-gated candidates", async () => {
    const repository = new FakeDiscoveryRepository();
    repository.opportunities.set("opp-1", makeOpportunity("opp-1"));

    const runIngestionImpl = vi.fn(async () => summary());
    const createAdapterImpl = vi.fn(() => ({
      sourceId: "src-1",
      discover: async () => [],
      fetchDetails: async () => {
        throw new Error("unused");
      },
    }));

    const result = await runFreshDiscovery({
      profile: makeProfile(),
      excludedOpportunityIds: new Set(),
      sources: [makeSource()],
      repository,
      now: NOW,
      logger: SILENT_LOGGER,
      runIngestionImpl,
      createAdapterImpl,
    });

    expect(runIngestionImpl).toHaveBeenCalledTimes(1);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].opportunity.id).toBe("opp-1");
    expect(result.sourceOutcomes[0].status).toBe("ingested");
    expect(result.allSourcesFailed).toBe(false);
  });

  it("reuses already-fresh opportunities for a source without calling ingestion", async () => {
    const repository = new FakeDiscoveryRepository();
    const fresh = makeOpportunity("opp-fresh");
    repository.opportunities.set("opp-fresh", fresh);
    repository.freshBySource.set("resolved-nist-ship", [fresh]);

    const runIngestionImpl = vi.fn(async () => summary());

    const result = await runFreshDiscovery({
      profile: makeProfile(),
      excludedOpportunityIds: new Set(),
      sources: [makeSource()],
      repository,
      now: NOW,
      logger: SILENT_LOGGER,
      runIngestionImpl,
    });

    expect(runIngestionImpl).not.toHaveBeenCalled();
    expect(result.sourceOutcomes[0].status).toBe("reused_fresh");
    expect(result.candidates.map((c) => c.opportunity.id)).toContain("opp-fresh");
  });

  it("never exceeds the shared detail-page budget across sources", async () => {
    const repository = new FakeDiscoveryRepository();
    const runIngestionImpl = vi.fn(async () => summary({ itemsFound: 6 }));

    await runFreshDiscovery({
      profile: makeProfile(),
      excludedOpportunityIds: new Set(),
      sources: [
        makeSource({ key: "nist-ship" as DiscoverySourceKey, name: "A" }),
        makeSource({ key: "nih-sip" as DiscoverySourceKey, name: "B" }),
        makeSource({ key: "mit-mites" as DiscoverySourceKey, name: "C" }),
      ],
      repository,
      now: NOW,
      logger: SILENT_LOGGER,
      limits: { maxDetailPages: 10, maxSources: 5, maxRecommendations: 3, perSourceTimeoutMs: 15_000 },
      runIngestionImpl,
    });

    // Two sources of 6 items each already exceed the 10-page budget — the third must be skipped.
    expect(runIngestionImpl).toHaveBeenCalledTimes(2);
  });

  it("never selects more than maxSources sources", async () => {
    const repository = new FakeDiscoveryRepository();
    const runIngestionImpl = vi.fn(async () => summary({ itemsFound: 0, records: [] }));

    const result = await runFreshDiscovery({
      profile: makeProfile(),
      excludedOpportunityIds: new Set(),
      sources: [
        makeSource({ key: "nist-ship" as DiscoverySourceKey }),
        makeSource({ key: "nih-sip" as DiscoverySourceKey }),
        makeSource({ key: "mit-mites" as DiscoverySourceKey }),
      ],
      repository,
      now: NOW,
      logger: SILENT_LOGGER,
      limits: { maxSources: 1, maxDetailPages: 10, maxRecommendations: 3, perSourceTimeoutMs: 15_000 },
      runIngestionImpl,
    });

    expect(result.sourcesAttempted).toHaveLength(1);
  });

  it("continues to the next source when one fails, and reports allSourcesFailed only when every attempted source failed", async () => {
    const repository = new FakeDiscoveryRepository();
    const runIngestionImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(summary());
    repository.opportunities.set("opp-1", makeOpportunity("opp-1"));

    const result = await runFreshDiscovery({
      profile: makeProfile(),
      excludedOpportunityIds: new Set(),
      sources: [
        makeSource({ key: "nist-ship" as DiscoverySourceKey, name: "A" }),
        makeSource({ key: "nih-sip" as DiscoverySourceKey, name: "B" }),
      ],
      repository,
      now: NOW,
      logger: SILENT_LOGGER,
      runIngestionImpl,
    });

    expect(result.sourceOutcomes.map((o) => o.status)).toEqual(["failed", "ingested"]);
    expect(result.allSourcesFailed).toBe(false);
    expect(result.anySourceFailed).toBe(true);
  });

  it("excludes already-shown opportunities from freshly discovered candidates", async () => {
    const repository = new FakeDiscoveryRepository();
    repository.opportunities.set("opp-1", makeOpportunity("opp-1"));

    const runIngestionImpl = vi.fn(async () => summary());

    const result = await runFreshDiscovery({
      profile: makeProfile(),
      excludedOpportunityIds: new Set(["opp-1"]),
      sources: [makeSource()],
      repository,
      now: NOW,
      logger: SILENT_LOGGER,
      runIngestionImpl,
    });

    expect(result.candidates).toHaveLength(0);
  });
});

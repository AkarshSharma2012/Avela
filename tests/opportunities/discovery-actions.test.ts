import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Profile } from "@/types/profile";

/**
 * Regression coverage for the real "Find more opportunities" bug: findMoreAction
 * used to construct a service-role client (createDiscoveryServiceRoleClient)
 * unconditionally, before even knowing whether fresh discovery would be
 * needed — so any problem with that client (most commonly a missing
 * SUPABASE_SERVICE_ROLE_KEY) hard-failed the entire action, even when the
 * existing catalog alone could have answered the request. See
 * docs/decision-log.md's "Find more opportunities reliability fix" entry.
 */

const getCurrentProfile = vi.fn();
const getOnboardingSummary = vi.fn();
const createClient = vi.fn();
const createDiscoveryServiceRoleClient = vi.fn();
const createSupabaseDiscoveryRepository = vi.fn();
const getFeedbackProfileForUser = vi.fn();
const listOpportunitiesForMatching = vi.fn();
const getOpportunitySourceNames = vi.fn();
const findMoreOpportunities = vi.fn();

vi.mock("@/lib/auth/dal", () => ({ getCurrentProfile: () => getCurrentProfile() }));
vi.mock("@/lib/onboarding/dal", () => ({ getOnboardingSummary: (...args: unknown[]) => getOnboardingSummary(...args) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));
vi.mock("@/lib/opportunities/discovery-repository", () => ({
  createDiscoveryServiceRoleClient: () => createDiscoveryServiceRoleClient(),
  createSupabaseDiscoveryRepository: (...args: unknown[]) => createSupabaseDiscoveryRepository(...args),
}));
vi.mock("@/lib/opportunities/feedback-repository", () => ({
  getFeedbackProfileForUser: (...args: unknown[]) => getFeedbackProfileForUser(...args),
}));
vi.mock("@/lib/opportunities/query", () => ({
  listOpportunitiesForMatching: (...args: unknown[]) => listOpportunitiesForMatching(...args),
  getOpportunitySourceNames: (...args: unknown[]) => getOpportunitySourceNames(...args),
}));
vi.mock("@/lib/opportunities/find-more", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/opportunities/find-more")>();
  return { ...actual, findMoreOpportunities: (...args: unknown[]) => findMoreOpportunities(...args) };
});

// Static, not per-test dynamic import: vi.mock's hoisting already applies
// before this module loads, so re-importing per test added latency
// (flaky under a full, heavily-parallel suite run) without any real
// isolation benefit — every dynamic import resolved to this same cached
// module instance anyway.
const { findMoreAction } = await import("@/lib/opportunities/discovery-actions");

/** A minimal fake Supabase query-builder: every chain method returns itself, and it resolves like a real builder does when awaited. */
function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => result,
    then: (resolve: (value: unknown) => unknown) => resolve(result),
  };
  return chain;
}

function makeAuthClient(result: { data: unknown; error: unknown } = { data: [], error: null }) {
  return { from: () => makeChainable(result) };
}

const PROFILE = {
  id: "user-1",
  grade_level: 11,
  state: "California",
  city: null,
} as unknown as Profile;

describe("findMoreAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a friendly message and never touches discovery when there's no session", async () => {
    getCurrentProfile.mockResolvedValue(null);

    const result = await findMoreAction();

    expect(result).toEqual({ ok: false, message: "Please sign in again to search for more opportunities." });
    expect(createDiscoveryServiceRoleClient).not.toHaveBeenCalled();
    expect(findMoreOpportunities).not.toHaveBeenCalled();
  });

  it("never constructs the service-role client itself — only hands findMoreOpportunities a lazy getter", async () => {
    getCurrentProfile.mockResolvedValue(PROFILE);
    getOnboardingSummary.mockResolvedValue({ interests: [], otherInterestText: null, goals: [], preferences: [] });
    createClient.mockResolvedValue(makeAuthClient());
    getFeedbackProfileForUser.mockResolvedValue(undefined);
    listOpportunitiesForMatching.mockResolvedValue({ data: [], error: null });
    getOpportunitySourceNames.mockResolvedValue(new Map());
    findMoreOpportunities.mockImplementation(async (deps: { getDiscoveryRepository: unknown }) => {
      // The regression this asserts: discovery-actions.ts must not have
      // already called createDiscoveryServiceRoleClient by the time
      // findMoreOpportunities receives its dependencies — only a function
      // that *would* call it, if invoked.
      expect(typeof deps.getDiscoveryRepository).toBe("function");
      expect(createDiscoveryServiceRoleClient).not.toHaveBeenCalled();
      return {
        recommendations: [],
        usedDiscovery: false,
        discoveryRunId: null,
        sourcesSearched: [],
        sourceFailures: [],
        status: "ok",
        message: null,
      };
    });

    const result = await findMoreAction();

    expect(result.ok).toBe(true);
    expect(createDiscoveryServiceRoleClient).not.toHaveBeenCalled();
    expect(findMoreOpportunities).toHaveBeenCalledTimes(1);
  });

  it("degrades gracefully (not a hard failure) when the lazy repository getter is actually invoked and construction fails", async () => {
    getCurrentProfile.mockResolvedValue(PROFILE);
    getOnboardingSummary.mockResolvedValue({ interests: ["Technology"], otherInterestText: null, goals: [], preferences: [] });
    createClient.mockResolvedValue(makeAuthClient());
    getFeedbackProfileForUser.mockResolvedValue(undefined);
    listOpportunitiesForMatching.mockResolvedValue({ data: [], error: null });
    getOpportunitySourceNames.mockResolvedValue(new Map());
    createDiscoveryServiceRoleClient.mockImplementation(() => {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — required for fresh discovery ingestion.");
    });
    findMoreOpportunities.mockImplementation(async (deps: { getDiscoveryRepository: () => unknown }) => {
      // Simulate find-more.ts reaching Step B and actually calling the getter.
      try {
        deps.getDiscoveryRepository();
        throw new Error("expected getDiscoveryRepository to throw");
      } catch (error) {
        return {
          recommendations: [],
          usedDiscovery: false,
          discoveryRunId: "run-1",
          sourcesSearched: [],
          sourceFailures: [{ sourceName: "discovery setup", errorSummary: (error as Error).message }],
          status: "source_failure_total",
          message: "Searching new sources isn't working right now — please try again in a bit.",
        };
      }
    });

    const result = await findMoreAction();

    // The old bug: this used to be `{ ok: false, message: "Discovery isn't
    // available right now — please try again later." }` unconditionally.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("source_failure_total");
      expect(result.message).toMatch(/try again/i);
    }
  });
});

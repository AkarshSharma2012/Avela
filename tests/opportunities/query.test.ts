import { describe, expect, it } from "vitest";

import {
  getOpportunityById,
  getSavedOpportunities,
  listOpportunities,
  listOpportunitiesForMatching,
} from "@/lib/opportunities/query";
import { EMPTY_FILTERS } from "@/lib/opportunities/search-params";
import type { Opportunity } from "@/types/opportunity";

const NOW = new Date("2026-07-26T12:00:00Z");

type Call = [string, ...unknown[]];

/**
 * A minimal stand-in for supabase-js's chainable query builder. Records
 * every `.eq`/`.in`/`.or`/`.order` call so tests can assert on exactly
 * which Postgrest filters `listOpportunities` builds, without a real
 * Supabase client or network access — the same "inject the dependency"
 * approach `tests/onboarding/form-submission.test.ts` uses for `save`.
 */
function createFakeSupabase(result: { data: unknown[]; count: number; error: null }) {
  const calls: Call[] = [];

  const builder = {
    eq: (...args: unknown[]) => {
      calls.push(["eq", ...args]);
      return builder;
    },
    in: (...args: unknown[]) => {
      calls.push(["in", ...args]);
      return builder;
    },
    or: (...args: unknown[]) => {
      calls.push(["or", ...args]);
      return builder;
    },
    order: (...args: unknown[]) => {
      calls.push(["order", ...args]);
      return builder;
    },
    range: (...args: unknown[]) => {
      calls.push(["range", ...args]);
      return Promise.resolve(result);
    },
    limit: (...args: unknown[]) => {
      calls.push(["limit", ...args]);
      return Promise.resolve(result);
    },
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };

  const supabase = {
    from: (table: string) => {
      calls.push(["from", table]);
      return {
        select: (...args: unknown[]) => {
          calls.push(["select", ...args]);
          return builder;
        },
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  return { supabase, calls };
}

function callsOf(calls: Call[], name: string): Call[] {
  return calls.filter((call) => call[0] === name);
}

describe("listOpportunities", () => {
  it("always scopes to active opportunities and excludes passed deadlines", async () => {
    const { supabase, calls } = createFakeSupabase({ data: [], count: 0, error: null });

    await listOpportunities(supabase, EMPTY_FILTERS, null, { now: NOW });

    expect(callsOf(calls, "eq")).toContainEqual(["eq", "is_active", true]);
    expect(callsOf(calls, "or")).toContainEqual([
      "or",
      `application_deadline.is.null,application_deadline.gte.${NOW.toISOString()}`,
    ]);
  });

  it("always excludes sample rows, the same way listOpportunitiesForMatching does, so SAMPLE DATA cards never reach the live Opportunities page", async () => {
    const { supabase, calls } = createFakeSupabase({ data: [], count: 0, error: null });

    await listOpportunities(supabase, EMPTY_FILTERS, null, { now: NOW });

    expect(callsOf(calls, "eq")).toContainEqual(["eq", "is_sample", false]);
  });

  it("does not filter by type/format/cost when none are selected", async () => {
    const { supabase, calls } = createFakeSupabase({ data: [], count: 0, error: null });

    await listOpportunities(supabase, EMPTY_FILTERS, null, { now: NOW });

    expect(callsOf(calls, "in")).toHaveLength(0);
  });

  it("applies type/format/cost as .in() filters when selected", async () => {
    const { supabase, calls } = createFakeSupabase({ data: [], count: 0, error: null });

    await listOpportunities(
      supabase,
      { ...EMPTY_FILTERS, types: ["internship", "research"], formats: ["virtual"], costs: ["free"] },
      null,
      { now: NOW }
    );

    expect(callsOf(calls, "in")).toContainEqual(["in", "opportunity_type", ["internship", "research"]]);
    expect(callsOf(calls, "in")).toContainEqual(["in", "format", ["virtual"]]);
    expect(callsOf(calls, "in")).toContainEqual(["in", "cost_type", ["free"]]);
  });

  it("applies remoteOnly as an eq filter", async () => {
    const { supabase, calls } = createFakeSupabase({ data: [], count: 0, error: null });

    await listOpportunities(supabase, { ...EMPTY_FILTERS, remoteOnly: true }, null, { now: NOW });

    expect(callsOf(calls, "eq")).toContainEqual(["eq", "remote_allowed", true]);
  });

  it("applies the grade filter as two ANDed OR clauses when a grade is known, myGradeOnly or not", async () => {
    const { supabase, calls } = createFakeSupabase({ data: [], count: 0, error: null });

    await listOpportunities(supabase, { ...EMPTY_FILTERS, myGradeOnly: true }, 10, { now: NOW });

    expect(callsOf(calls, "or")).toContainEqual(["or", "min_grade.is.null,min_grade.lte.10"]);
    expect(callsOf(calls, "or")).toContainEqual(["or", "max_grade.is.null,max_grade.gte.10"]);
  });

  it("applies the grade filter by default even when myGradeOnly is not set — grade-ineligible results are hidden by default (Milestone 5)", async () => {
    const { supabase, calls } = createFakeSupabase({ data: [], count: 0, error: null });

    await listOpportunities(supabase, EMPTY_FILTERS, 10, { now: NOW });

    expect(callsOf(calls, "or")).toContainEqual(["or", "min_grade.is.null,min_grade.lte.10"]);
    expect(callsOf(calls, "or")).toContainEqual(["or", "max_grade.is.null,max_grade.gte.10"]);
  });

  it("skips the grade filter when the student has no grade on file", async () => {
    const { supabase, calls } = createFakeSupabase({ data: [], count: 0, error: null });

    await listOpportunities(supabase, { ...EMPTY_FILTERS, myGradeOnly: true }, null, { now: NOW });

    expect(callsOf(calls, "or").some((call) => String(call[1]).includes("min_grade"))).toBe(false);
  });

  it("always excludes closed deadlines, closed applications, and rejected/stale verification by default", async () => {
    const { supabase, calls } = createFakeSupabase({ data: [], count: 0, error: null });

    await listOpportunities(supabase, EMPTY_FILTERS, null, { now: NOW });

    expect(callsOf(calls, "or")).toContainEqual(["or", "deadline_status.neq.closed"]);
    expect(callsOf(calls, "or")).toContainEqual(["or", "application_status.neq.closed"]);
    expect(callsOf(calls, "or")).toContainEqual(["or", "verification_status.neq.rejected"]);
    expect(callsOf(calls, "or")).toContainEqual(["or", "verification_status.neq.stale"]);
  });

  it("excludes an unresolved citizenship requirement by default, unless includeUnclearEligibility is set", async () => {
    const hidden = createFakeSupabase({ data: [], count: 0, error: null });
    await listOpportunities(hidden.supabase, EMPTY_FILTERS, null, { now: NOW });
    expect(callsOf(hidden.calls, "or")).toContainEqual([
      "or",
      'citizenship_requirements.is.null,citizenship_requirements.ilike."%none%"',
    ]);

    const shown = createFakeSupabase({ data: [], count: 0, error: null });
    await listOpportunities(
      shown.supabase,
      { ...EMPTY_FILTERS, includeUnclearEligibility: true },
      null,
      { now: NOW }
    );
    expect(
      callsOf(shown.calls, "or").some((call) => String(call[1]).includes("citizenship_requirements"))
    ).toBe(false);
  });

  it("applies a residency match filter only when the student's state is known", async () => {
    const withState = createFakeSupabase({ data: [], count: 0, error: null });
    await listOpportunities(withState.supabase, EMPTY_FILTERS, null, {
      now: NOW,
      studentState: "Washington",
    });
    expect(callsOf(withState.calls, "or")).toContainEqual([
      "or",
      'residency_requirements.is.null,residency_requirements.ilike."%Washington%"',
    ]);

    const withoutState = createFakeSupabase({ data: [], count: 0, error: null });
    await listOpportunities(withoutState.supabase, EMPTY_FILTERS, null, { now: NOW });
    expect(
      callsOf(withoutState.calls, "or").some((call) =>
        String(call[1]).startsWith("residency_requirements.is.null,residency_requirements.ilike")
      )
    ).toBe(false);
  });

  it("applies the verifiedOnly/acceptingOnly/rollingOnly/openingSoonOnly toggles as eq filters", async () => {
    const { supabase, calls } = createFakeSupabase({ data: [], count: 0, error: null });

    await listOpportunities(
      supabase,
      {
        ...EMPTY_FILTERS,
        verifiedOnly: true,
        acceptingOnly: true,
        rollingOnly: true,
        openingSoonOnly: true,
      },
      null,
      { now: NOW }
    );

    expect(callsOf(calls, "eq")).toContainEqual(["eq", "verification_status", "verified"]);
    expect(callsOf(calls, "eq")).toContainEqual(["eq", "application_status", "accepting_applications"]);
    expect(callsOf(calls, "eq")).toContainEqual(["eq", "deadline_status", "rolling"]);
    expect(callsOf(calls, "eq")).toContainEqual(["eq", "application_status", "opening_soon"]);
  });

  it("eligibleOnly excludes any residency-restricted listing when the student's state is unknown", async () => {
    const { supabase, calls } = createFakeSupabase({ data: [], count: 0, error: null });

    await listOpportunities(supabase, { ...EMPTY_FILTERS, eligibleOnly: true }, null, { now: NOW });

    expect(callsOf(calls, "or")).toContainEqual(["or", "residency_requirements.is.null"]);
  });

  it("narrows the deadline window in addition to (not instead of) the default not-passed filter", async () => {
    const { supabase, calls } = createFakeSupabase({ data: [], count: 0, error: null });

    await listOpportunities(supabase, { ...EMPTY_FILTERS, deadlineWithin: "7d" }, null, { now: NOW });

    const windowEnd = new Date(NOW.getTime() + 7 * 86_400_000).toISOString();
    expect(callsOf(calls, "or")).toContainEqual([
      "or",
      `application_deadline.is.null,application_deadline.gte.${NOW.toISOString()}`,
    ]);
    expect(callsOf(calls, "or")).toContainEqual([
      "or",
      `application_deadline.is.null,application_deadline.lte.${windowEnd}`,
    ]);
  });

  it("computes range() from the requested page and the fixed page size", async () => {
    const { supabase, calls } = createFakeSupabase({ data: [], count: 0, error: null });

    await listOpportunities(supabase, { ...EMPTY_FILTERS, page: 3 }, null, { now: NOW });

    expect(callsOf(calls, "range")).toContainEqual(["range", 24, 35]);
  });

  it("sanitizes commas and parentheses out of the search term before building the ilike pattern", async () => {
    const { supabase, calls } = createFakeSupabase({ data: [], count: 0, error: null });

    await listOpportunities(supabase, { ...EMPTY_FILTERS, q: "robotics, (2027)" }, null, { now: NOW });

    const searchCall = callsOf(calls, "or").find((call) => String(call[1]).includes("ilike"));
    // The three ilike conditions are themselves comma-separated (valid
    // Postgrest .or() syntax) — what must never appear is a *raw* comma or
    // parenthesis from the user's own search term inside the quoted value.
    expect(searchCall?.[1]).toContain('"%robotics   2027%"');
    expect(searchCall?.[1]).not.toMatch(/2027\)/);
    expect(searchCall?.[1]).not.toMatch(/,\s*\(/);
  });

  it("returns a friendly error and no data when the query fails", async () => {
    const { supabase } = createFakeSupabase({ data: [], count: 0, error: null });
    supabase.from = () => ({
      select: () => ({
        eq: function () {
          return this;
        },
        or: function () {
          return this;
        },
        order: function () {
          return this;
        },
        range: () => Promise.resolve({ data: null, count: null, error: { message: "db down" } }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    const result = await listOpportunities(supabase, EMPTY_FILTERS, null, { now: NOW });

    expect(result.data).toEqual([]);
    expect(result.error).not.toBeNull();
    expect(result.error).not.toMatch(/db down/);
  });
});

describe("listOpportunitiesForMatching", () => {
  it("scopes to active, non-sample opportunities", async () => {
    const { supabase, calls } = createFakeSupabase({ data: [], count: 0, error: null });

    await listOpportunitiesForMatching(supabase, null, { now: NOW });

    expect(callsOf(calls, "eq")).toContainEqual(["eq", "is_active", true]);
    expect(callsOf(calls, "eq")).toContainEqual(["eq", "is_sample", false]);
  });

  it("excludes passed deadlines, closed applications, and rejected/stale verification", async () => {
    const { supabase, calls } = createFakeSupabase({ data: [], count: 0, error: null });

    await listOpportunitiesForMatching(supabase, null, { now: NOW });

    expect(callsOf(calls, "or")).toContainEqual([
      "or",
      `application_deadline.is.null,application_deadline.gte.${NOW.toISOString()}`,
    ]);
    expect(callsOf(calls, "or")).toContainEqual(["or", "deadline_status.neq.closed"]);
    expect(callsOf(calls, "or")).toContainEqual(["or", "application_status.neq.closed"]);
    expect(callsOf(calls, "or")).toContainEqual(["or", "verification_status.neq.rejected"]);
    expect(callsOf(calls, "or")).toContainEqual(["or", "verification_status.neq.stale"]);
  });

  it("applies the grade filter only when the student's grade is known", async () => {
    const { supabase, calls } = createFakeSupabase({ data: [], count: 0, error: null });

    await listOpportunitiesForMatching(supabase, 10, { now: NOW });

    expect(callsOf(calls, "or")).toContainEqual(["or", "min_grade.is.null,min_grade.lte.10"]);
    expect(callsOf(calls, "or")).toContainEqual(["or", "max_grade.is.null,max_grade.gte.10"]);
  });

  it("returns a friendly error and no data when the query fails", async () => {
    const { supabase } = createFakeSupabase({ data: [], count: 0, error: null });
    supabase.from = () => ({
      select: () => ({
        eq: function () {
          return this;
        },
        or: function () {
          return this;
        },
        order: function () {
          return this;
        },
        limit: () => Promise.resolve({ data: null, error: { message: "db down" } }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    const result = await listOpportunitiesForMatching(supabase, null, { now: NOW });

    expect(result.data).toEqual([]);
    expect(result.error).not.toBeNull();
    expect(result.error).not.toMatch(/db down/);
  });
});

describe("getOpportunityById", () => {
  it("scopes to active, non-sample opportunities so a sample id never renders for a real user", async () => {
    const { supabase, calls } = createFakeSupabase({ data: [], count: 0, error: null });

    await getOpportunityById(supabase, "some-id");

    expect(callsOf(calls, "eq")).toContainEqual(["eq", "id", "some-id"]);
    expect(callsOf(calls, "eq")).toContainEqual(["eq", "is_active", true]);
    expect(callsOf(calls, "eq")).toContainEqual(["eq", "is_sample", false]);
  });
});

describe("getSavedOpportunities", () => {
  function makeOpportunity(id: string): Opportunity {
    return {
      id,
      title: `Opportunity ${id}`,
      organization: "Org",
      description: "Description",
      opportunity_type: "club",
      format: "virtual",
      location_text: null,
      remote_allowed: true,
      min_grade: null,
      max_grade: null,
      cost_type: "free",
      cost_amount: null,
      interest_tags: [],
      application_deadline: null,
      start_date: null,
      end_date: null,
      weekly_commitment_hours: null,
      duration_text: null,
      application_url: "https://example.org",
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
      verification_label: "needs_review",
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
    };
  }

  it("preserves most-recently-saved-first order and drops rows whose opportunity no longer exists", async () => {
    const savedRows = [
      { opportunity_id: "b", created_at: "2026-02-01T00:00:00Z" },
      { opportunity_id: "a", created_at: "2026-01-01T00:00:00Z" },
      { opportunity_id: "missing", created_at: "2026-03-01T00:00:00Z" },
    ];

    const supabase = {
      from: (table: string) => {
        if (table === "saved_opportunities") {
          return {
            select: () => ({
              eq: () => ({
                order: () => Promise.resolve({ data: savedRows, error: null }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            in: () => ({
              eq: () =>
                Promise.resolve({
                  data: [makeOpportunity("a"), makeOpportunity("b")],
                  error: null,
                }),
            }),
          }),
        };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const entries = await getSavedOpportunities(supabase, "user-1");

    expect(entries.map((entry) => entry.opportunity.id)).toEqual(["b", "a"]);
  });

  it("excludes sample opportunities from the resolved saved list", async () => {
    const savedRows = [{ opportunity_id: "a", created_at: "2026-01-01T00:00:00Z" }];
    const opportunityCalls: unknown[][] = [];

    const supabase = {
      from: (table: string) => {
        if (table === "saved_opportunities") {
          return {
            select: () => ({
              eq: () => ({
                order: () => Promise.resolve({ data: savedRows, error: null }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            in: (...inArgs: unknown[]) => {
              opportunityCalls.push(["in", ...inArgs]);
              return {
                eq: (...eqArgs: unknown[]) => {
                  opportunityCalls.push(["eq", ...eqArgs]);
                  return Promise.resolve({ data: [makeOpportunity("a")], error: null });
                },
              };
            },
          }),
        };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await getSavedOpportunities(supabase, "user-1");

    expect(opportunityCalls).toContainEqual(["eq", "is_sample", false]);
  });

  it("returns an empty list when the student has saved nothing", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const entries = await getSavedOpportunities(supabase, "user-1");

    expect(entries).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import { summarizeClaimDimensions } from "@/lib/claims/rollup";
import type { ClaimDimension, ClaimDimensionResult, ClaimDimensionStatus } from "@/types/claims";

/**
 * Milestone 10.9, spec Part 13 — deterministic synthetic fixtures proving
 * two things at the claim-support level (summarizeClaimDimensions,
 * src/lib/claims/rollup.ts), separate from strength-fairness.test.ts's
 * proof for the documentation-completeness score (strength.ts):
 *
 * 1. An Avela-like software project with strong, multi-dimensional support
 *    reaches "Strong" — never capped low the way the spec's "~25%" bug
 *    described, and never "Strong" off a single confirmed dimension.
 * 2. Equivalent evidence *depth* for a non-code activity (go-kart,
 *    painting, music, research, writing, sports, volunteering, family
 *    responsibility, team project) reaches the identical support level —
 *    summarizeClaimDimensions never reads item_type, category, or any
 *    prestige signal, only the dimension statuses handed to it, so a code
 *    project gets no automatic advantage merely because GitHub offers
 *    OAuth and a go-kart build doesn't.
 */

let counter = 0;
function makeDimension(dimension: ClaimDimension, status: ClaimDimensionStatus): ClaimDimensionResult {
  counter += 1;
  return {
    id: `dim-${counter}`,
    user_id: "user-1",
    portfolio_item_id: "item-1",
    dimension,
    status,
    stale: false,
    evidence_ref: {},
    notes: null,
    updated_by_actor_type: "system",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
  };
}

describe("Avela-like software project — claim-level support", () => {
  it("reaches Strong with real, multi-dimensional evidence (never capped at a misleading low number)", () => {
    const summary = summarizeClaimDimensions([
      makeDimension("identity_control", "externally_confirmed"), // connected GitHub account
      makeDimension("project_or_activity_exists", "strongly_supported"), // live deployment + repo
      makeDimension("account_or_asset_control", "externally_confirmed"), // repo ownership confirmed
      makeDimension("authorship_or_contribution", "strongly_supported"), // commit history matches
      makeDimension("dates_and_duration", "partially_supported"), // repo activity overlaps claimed dates
      makeDimension("impact_or_outcome", "not_checked"), // no independent usage evidence yet — honest gap
    ]);

    expect(summary.level).toBe("strong");
    expect(summary.headline).toBe("Strong");
  });

  it("never reaches Strong off a single confirmed dimension alone (spec: one check must never verify the whole entry)", () => {
    const summary = summarizeClaimDimensions([makeDimension("identity_control", "externally_confirmed")]);
    expect(summary.level).not.toBe("strong");
  });

  it("impact/outcome staying not_checked does not block Strong when it is honestly the only unproven dimension", () => {
    const summary = summarizeClaimDimensions([
      makeDimension("identity_control", "externally_confirmed"),
      makeDimension("project_or_activity_exists", "strongly_supported"),
      makeDimension("authorship_or_contribution", "strongly_supported"),
      makeDimension("impact_or_outcome", "not_checked"),
    ]);
    expect(summary.level).toBe("strong");
  });
});

describe("cross-category fairness — identical dimension-status depth yields identical support level", () => {
  const EQUIVALENT_STRONG_PROFILE: [ClaimDimension, ClaimDimensionStatus][] = [
    ["identity_control", "externally_confirmed"],
    ["project_or_activity_exists", "strongly_supported"],
    ["authorship_or_contribution", "strongly_supported"],
  ];

  const activities: { label: string; extra?: [ClaimDimension, ClaimDimensionStatus] }[] = [
    { label: "software (Avela-like)" },
    { label: "go-kart build", extra: ["output_or_deliverable", "strongly_supported"] },
    { label: "painting" },
    { label: "music performance" },
    { label: "research paper" },
    { label: "writing / journalism" },
    { label: "sports" },
    { label: "volunteering" },
    { label: "family responsibility" },
    { label: "team project (personal contribution only)" },
  ];

  it.each(activities)("$label reaches the same support level as every other category given equal evidence depth", ({ extra }) => {
    const dims = extra ? [...EQUIVALENT_STRONG_PROFILE, extra] : EQUIVALENT_STRONG_PROFILE;
    const summary = summarizeClaimDimensions(dims.map(([dimension, status]) => makeDimension(dimension, status)));
    expect(summary.level).toBe("strong");
  });

  it("a code project with only one weak dimension checked scores no better than a non-code project with the same one weak dimension", () => {
    const codeOnly = summarizeClaimDimensions([makeDimension("identity_control", "partially_supported")]);
    const nonCodeOnly = summarizeClaimDimensions([makeDimension("output_or_deliverable", "partially_supported")]);
    expect(codeOnly.level).toBe(nonCodeOnly.level);
  });

  it("family responsibility with no formal organization relationship is not penalized relative to an organization-backed activity at equal depth", () => {
    const familyResponsibility = summarizeClaimDimensions([
      makeDimension("identity_control", "externally_confirmed"),
      makeDimension("authorship_or_contribution", "strongly_supported"),
      makeDimension("third_party_confirmation", "strongly_supported"), // e.g. a parent/sibling confirmation
    ]);
    const orgBacked = summarizeClaimDimensions([
      makeDimension("identity_control", "externally_confirmed"),
      makeDimension("authorship_or_contribution", "strongly_supported"),
      makeDimension("organization_relationship", "strongly_supported"),
    ]);
    expect(familyResponsibility.level).toBe(orgBacked.level);
  });
});

describe("team project — personal contribution separated from team result", () => {
  it("a strong team output does not, by itself, make personal contribution Strong", () => {
    const summary = summarizeClaimDimensions([
      makeDimension("output_or_deliverable", "strongly_supported"), // the team's result
      makeDimension("authorship_or_contribution", "not_checked"), // this student's personal part — not yet assessed
    ]);
    expect(summary.level).not.toBe("strong");
    const contributionRow = summary.rows.find((r) => r.dimension === "authorship_or_contribution");
    expect(contributionRow?.status).toBe("not_checked");
  });
});

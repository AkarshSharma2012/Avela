import { describe, expect, it } from "vitest";

import { computeCoverageReport } from "@/lib/opportunities/coverage";
import type { Opportunity } from "@/types/opportunity";

function makeOpportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    title: "Sample Opportunity",
    organization: "Sample Org",
    description: "A sample opportunity.",
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
    weekly_commitment_hours: null,
    duration_text: null,
    application_url: "https://example.org/apply",
    source_url: null,
    image_url: null,
    is_active: true,
    is_verified: false,
    is_sample: false,
    canonical_url: null,
    source_id: null,
    last_verified_at: null,
    next_verification_at: null,
    verification_status: "verified",
    verification_confidence: 80,
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

describe("computeCoverageReport", () => {
  it("reports an empty catalog as a single gap", () => {
    const report = computeCoverageReport([]);
    expect(report.total).toBe(0);
    expect(report.gaps).toContain("Catalog is empty.");
  });

  it("counts by type, format, cost, and verification label", () => {
    const report = computeCoverageReport([
      makeOpportunity({ opportunity_type: "internship", format: "virtual", cost_type: "free" }),
      makeOpportunity({ opportunity_type: "competition", format: "in_person", cost_type: "paid" }),
    ]);
    expect(report.byType.internship).toBe(1);
    expect(report.byType.competition).toBe(1);
    expect(report.byFormat.virtual).toBe(1);
    expect(report.byCost.free).toBe(1);
    expect(report.byVerificationLabel.verified_accepting).toBe(2);
  });

  it("counts every grade a listing's range covers, including open-ended ranges", () => {
    const report = computeCoverageReport([
      makeOpportunity({ min_grade: 9, max_grade: 12 }),
      makeOpportunity({ min_grade: null, max_grade: null }),
    ]);
    expect(report.byGrade[6]).toBe(1); // only the all-grades listing covers grade 6
    expect(report.byGrade[9]).toBe(2);
    expect(report.byGrade[12]).toBe(2);
  });

  it("flags a missing grade as a gap", () => {
    const report = computeCoverageReport([makeOpportunity({ min_grade: 9, max_grade: 12 })]);
    expect(report.gaps).toContain("No opportunities open to Grade 8 students.");
    expect(report.gaps).not.toContain("No opportunities open to Grade 9 students.");
  });

  it("flags no business/entrepreneurship-tagged opportunities when none are present", () => {
    const report = computeCoverageReport([makeOpportunity({ interest_tags: ["Technology"] })]);
    expect(report.gaps).toContain("No business/entrepreneurship-tagged opportunities.");
  });

  it("does not flag the business gap once a business-tagged opportunity exists", () => {
    const report = computeCoverageReport([
      makeOpportunity({ interest_tags: ["Business"] }),
      makeOpportunity({ interest_tags: ["Technology"] }),
    ]);
    expect(report.gaps).not.toContain("No business/entrepreneurship-tagged opportunities.");
  });

  it("flags no free opportunities and no virtual opportunities when true", () => {
    const report = computeCoverageReport([makeOpportunity({ cost_type: "paid", format: "in_person" })]);
    expect(report.gaps).toContain("No free opportunities.");
    expect(report.gaps).toContain("No virtual opportunities.");
  });
});

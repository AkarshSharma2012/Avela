import { describe, expect, it } from "vitest";

import { isOpportunityClosedOrExpired } from "@/lib/applications/opportunity-status";

describe("isOpportunityClosedOrExpired", () => {
  it("is false for an active, open, accepting-applications opportunity", () => {
    expect(
      isOpportunityClosedOrExpired({ is_active: true, deadline_status: "open", application_status: "accepting_applications" })
    ).toBe(false);
  });

  it("is true when the opportunity has been deactivated", () => {
    expect(
      isOpportunityClosedOrExpired({ is_active: false, deadline_status: "open", application_status: "accepting_applications" })
    ).toBe(true);
  });

  it("is true once the deadline has closed", () => {
    expect(
      isOpportunityClosedOrExpired({ is_active: true, deadline_status: "closed", application_status: "accepting_applications" })
    ).toBe(true);
  });

  it("is true once applications have closed, even if the deadline label hasn't caught up", () => {
    expect(isOpportunityClosedOrExpired({ is_active: true, deadline_status: "open", application_status: "closed" })).toBe(true);
  });

  it("is false for rolling admissions with an unknown application status", () => {
    expect(isOpportunityClosedOrExpired({ is_active: true, deadline_status: "rolling", application_status: "unknown" })).toBe(false);
  });
});

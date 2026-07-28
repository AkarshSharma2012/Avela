import { describe, expect, it } from "vitest";

import { claimTypeForItemType, isOsintEligible } from "@/lib/osint/claim-eligibility";

describe("isOsintEligible — spec section 2's allowlist", () => {
  it("is eligible for project, award, certification, course, volunteer, leadership, work experience, and activity", () => {
    for (const itemType of ["project", "award", "certification", "course", "volunteer_service", "leadership", "work_experience", "activity"] as const) {
      expect(isOsintEligible(itemType)).toBe(true);
    }
  });

  it("is never eligible for recommendation contacts, essays, private documents, or informal/custom entries", () => {
    for (const itemType of ["recommendation_contact", "essay_response", "document", "skill", "link", "custom"] as const) {
      expect(isOsintEligible(itemType)).toBe(false);
    }
  });
});

describe("claimTypeForItemType", () => {
  it("maps volunteer_service to public_volunteer_role", () => {
    expect(claimTypeForItemType("volunteer_service")).toBe("public_volunteer_role");
  });

  it("returns null for an ineligible item type", () => {
    expect(claimTypeForItemType("recommendation_contact")).toBeNull();
  });
});

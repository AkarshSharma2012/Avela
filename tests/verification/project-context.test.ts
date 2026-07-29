import { describe, expect, it } from "vitest";

import { isOrganizationRequired, validateOrganizationRequirement } from "@/lib/verification/project-context";

describe("isOrganizationRequired", () => {
  it("requires an organization only for org_linked", () => {
    expect(isOrganizationRequired("org_linked")).toBe(true);
    expect(isOrganizationRequired("personal_project")).toBe(false);
  });

  it("treats an unclassified (null) item the same as today's behavior — organization optional", () => {
    expect(isOrganizationRequired(null)).toBe(false);
  });
});

describe("validateOrganizationRequirement", () => {
  it("errors when org_linked has no organization", () => {
    expect(validateOrganizationRequirement("org_linked", null)).toMatch(/needs an organization/);
    expect(validateOrganizationRequirement("org_linked", "  ")).toMatch(/needs an organization/);
  });

  it("passes when org_linked has an organization", () => {
    expect(validateOrganizationRequirement("org_linked", "Red Cross")).toBeNull();
  });

  it("never requires an organization for a personal project", () => {
    expect(validateOrganizationRequirement("personal_project", null)).toBeNull();
  });

  it("never requires an organization for an unclassified item", () => {
    expect(validateOrganizationRequirement(null, null)).toBeNull();
  });
});

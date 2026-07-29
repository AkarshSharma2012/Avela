import { describe, expect, it } from "vitest";

import {
  PROJECT_CONTEXTS,
  PROJECT_CONTEXT_LABELS,
  getFieldVisibilityForContext,
  normalizeProjectContext,
} from "@/lib/portfolio/project-context";
import type { PortfolioItemProjectContext } from "@/types/database";

describe("normalizeProjectContext", () => {
  it("treats the legacy 'org_linked' value as 'organization_project'", () => {
    expect(normalizeProjectContext("org_linked")).toBe("organization_project");
  });

  it("passes every other value through unchanged", () => {
    expect(normalizeProjectContext("personal_project")).toBe("personal_project");
    expect(normalizeProjectContext("family_or_household")).toBe("family_or_household");
  });

  it("returns null for null/undefined", () => {
    expect(normalizeProjectContext(null)).toBeNull();
    expect(normalizeProjectContext(undefined)).toBeNull();
  });
});

describe("PROJECT_CONTEXT_LABELS", () => {
  it("has a label for every selectable context plus the legacy value", () => {
    for (const { value } of PROJECT_CONTEXTS) {
      expect(PROJECT_CONTEXT_LABELS[value]).toBeTruthy();
    }
    expect(PROJECT_CONTEXT_LABELS.org_linked).toBe(PROJECT_CONTEXT_LABELS.organization_project);
  });
});

describe("getFieldVisibilityForContext — spec section 2 rules", () => {
  it("personal projects do not require an organization", () => {
    expect(getFieldVisibilityForContext("personal_project").organizationRequired).toBe(false);
  });

  it("independent activity does not require an organization", () => {
    expect(getFieldVisibilityForContext("independent_activity").organizationRequired).toBe(false);
  });

  it("family or household work does not require an organization and never nudges for evidence", () => {
    const visibility = getFieldVisibilityForContext("family_or_household");
    expect(visibility.organizationRequired).toBe(false);
    expect(visibility.evidenceOptionalWithNoNudge).toBe(true);
  });

  it("school work may suggest teacher confirmation but does not require it (no field is ever hard-required to save)", () => {
    const visibility = getFieldVisibilityForContext("school_project");
    expect(visibility.suggestTeacherConfirmation).toBe(true);
  });

  it("team work shows team-specific fields separating personal contribution from team output", () => {
    expect(getFieldVisibilityForContext("team_project").showTeamFields).toBe(true);
  });

  it("employment requires organization context", () => {
    const visibility = getFieldVisibilityForContext("employment");
    expect(visibility.organizationRequired).toBe(true);
    expect(visibility.showEmploymentFields).toBe(true);
  });

  it("competition claims may suggest an official result page", () => {
    expect(getFieldVisibilityForContext("competition").suggestOfficialResultLink).toBe(true);
  });

  it("legacy org_linked resolves identically to organization_project", () => {
    expect(getFieldVisibilityForContext("org_linked")).toEqual(getFieldVisibilityForContext("organization_project"));
  });

  it("degrades to the least-demanding defaults for an unrecognized/null context, never a blocking state", () => {
    const visibility = getFieldVisibilityForContext(null);
    expect(visibility.organizationRequired).toBe(false);
  });

  it("never requires evidence for any context — evidence is always optional structurally", () => {
    const allContexts: PortfolioItemProjectContext[] = PROJECT_CONTEXTS.map((option) => option.value);
    for (const context of allContexts) {
      const visibility = getFieldVisibilityForContext(context);
      expect(visibility).not.toHaveProperty("evidenceRequired");
    }
  });
});

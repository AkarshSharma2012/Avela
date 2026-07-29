import { describe, expect, it } from "vitest";

import {
  applyFieldPatchToSnapshot,
  buildMaterialChangeReason,
  classifyEdit,
  computeMaterialHash,
  snapshotFromItem,
  type MaterialSnapshotFields,
} from "@/lib/claims/material-hash";
import type { PortfolioItem } from "@/types/portfolio";

const BASE: MaterialSnapshotFields = {
  title: "Robotics Club",
  organization: "Lincoln High School",
  role: "Team captain",
  startDate: "2025-09-01",
  endDate: null,
  description: "Led a team of five building a competition robot for the regional STEM fair.",
  outcome: "Placed second regionally.",
  hoursPerWeek: 5,
  weeksPerYear: 30,
  projectContext: "org_linked",
  url: null,
};

describe("computeMaterialHash", () => {
  it("is deterministic and normalizes whitespace/case so a trivial formatting difference hashes identically", async () => {
    const a = await computeMaterialHash(BASE);
    const b = await computeMaterialHash({ ...BASE, title: "  ROBOTICS   club  " });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces a different hash when a structural field differs", async () => {
    const a = await computeMaterialHash(BASE);
    const b = await computeMaterialHash({ ...BASE, organization: "Different School" });
    expect(a).not.toBe(b);
  });
});

describe("classifyEdit — structural fields (exact, normalized)", () => {
  it("is not material when nothing changed", () => {
    expect(classifyEdit(BASE, { ...BASE })).toEqual({ isMaterial: false, changedFields: [] });
  });

  it("flags organization, role, dates, hours, project type, and url changes as material — no fuzzy tolerance", () => {
    expect(classifyEdit(BASE, { ...BASE, organization: "A Different Org" }).changedFields).toContain("organization");
    expect(classifyEdit(BASE, { ...BASE, role: "Member" }).changedFields).toContain("role");
    expect(classifyEdit(BASE, { ...BASE, startDate: "2025-10-01" }).changedFields).toContain("startDate");
    expect(classifyEdit(BASE, { ...BASE, hoursPerWeek: 20 }).changedFields).toContain("hoursPerWeek");
    expect(classifyEdit(BASE, { ...BASE, projectContext: "personal_project" }).changedFields).toContain("projectContext");
    expect(classifyEdit(BASE, { ...BASE, url: "https://example.com" }).changedFields).toContain("url");
  });

  it("does not flag a structural field when only whitespace/case differs", () => {
    expect(classifyEdit(BASE, { ...BASE, organization: "  lincoln high school  " }).changedFields).not.toContain("organization");
  });
});

describe("classifyEdit — fuzzy free-text fields", () => {
  it("preserves verification for a spelling/formatting fix that keeps the same meaning (spec section 8)", () => {
    const result = classifyEdit(BASE, { ...BASE, description: "Led a team of five building a competiton robot for the regional STEM fair." });
    expect(result.changedFields).not.toContain("description");
  });

  it("flags a genuinely different claim in a free-text field as material", () => {
    const result = classifyEdit(BASE, { ...BASE, outcome: "Won the national championship and received a full scholarship." });
    expect(result.changedFields).toContain("outcome");
    expect(result.isMaterial).toBe(true);
  });
});

describe("buildMaterialChangeReason", () => {
  it("names the changed fields in neutral language", () => {
    expect(buildMaterialChangeReason(["organization", "role"])).toBe("The organization, role changed since this was last checked.");
  });
});

describe("snapshotFromItem / applyFieldPatchToSnapshot", () => {
  it("builds a snapshot from a full PortfolioItem row", () => {
    const item = {
      id: "item-1",
      user_id: "user-1",
      item_type: "activity",
      title: "Debate",
      organization: "Club",
      description: null,
      start_date: null,
      end_date: null,
      is_current: false,
      hours_per_week: null,
      weeks_per_year: null,
      role: "Member",
      outcome: null,
      skills: [],
      tags: [],
      url: null,
      github_username: null,
      project_context: "org_linked",
      last_material_hash: null,
      material_hash_updated_at: null,
      visibility: "visible",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    } as unknown as PortfolioItem;

    expect(snapshotFromItem(item)).toMatchObject({ title: "Debate", organization: "Club", role: "Member" });
  });

  it("applies only the fields present in a partial patch, leaving the rest untouched", () => {
    const patched = applyFieldPatchToSnapshot(BASE, { role: "New role" });
    expect(patched.role).toBe("New role");
    expect(patched.organization).toBe(BASE.organization);
  });
});

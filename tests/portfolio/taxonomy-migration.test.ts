import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../supabase/migrations/20260813000000_activity_taxonomy_and_project_context.sql"
);

const sql = readFileSync(MIGRATION_PATH, "utf-8");

describe("portfolio_items.activity_category_key", () => {
  it("is a plain length-bounded text column, not a check-constrained enum", () => {
    const start = sql.indexOf("activity_category_key text check (");
    expect(start).toBeGreaterThan(-1);
    const end = sql.indexOf(");", start);
    const columnDefinition = sql.slice(start, end);
    expect(columnDefinition).toMatch(/length\(activity_category_key\) <= 100/);
    expect(columnDefinition).not.toMatch(/ in \(/);
  });

  it("is nullable so every pre-Milestone-10.8 item is unaffected", () => {
    expect(sql).not.toMatch(/activity_category_key text not null/);
  });
});

describe("portfolio_items.template_version", () => {
  it("is a not-null integer defaulting to 1", () => {
    expect(sql).toMatch(/template_version integer not null default 1/);
  });
});

describe("portfolio_items.project_context widening", () => {
  it("keeps both legacy Milestone 10.7 values valid", () => {
    const check = sql.match(/portfolio_items_project_context_check check \(([\s\S]*?)\);/);
    expect(check).not.toBeNull();
    expect(check?.[1]).toContain("'org_linked'");
    expect(check?.[1]).toContain("'personal_project'");
  });

  it("adds every Milestone 10.8 spec section 2 context value", () => {
    const check = sql.match(/portfolio_items_project_context_check check \(([\s\S]*?)\);/);
    expect(check).not.toBeNull();
    for (const value of [
      "organization_project",
      "school_project",
      "team_project",
      "family_or_household",
      "community_project",
      "employment",
      "competition",
      "course_or_program",
      "independent_activity",
      "custom",
    ]) {
      expect(check?.[1]).toContain(`'${value}'`);
    }
  });

  it("drops the old auto-named constraint before re-adding it, so the widening actually applies", () => {
    expect(sql).toMatch(/drop constraint if exists portfolio_items_project_context_check/);
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../supabase/migrations/20260727000000_opportunity_intelligence.sql"
);

const sql = readFileSync(MIGRATION_PATH, "utf-8");

const SERVICE_ROLE_ONLY_TABLES = [
  "opportunity_sources",
  "opportunity_ingestion_runs",
  "raw_opportunity_records",
  "opportunity_source_links",
  "opportunity_review_queue",
];

/** Every `create policy ... on public.<table> ...` in the migration. */
function policiesFor(source: string, table: string): string[] {
  const pattern = new RegExp(`create policy[^;]*?on public\\.${table}[^;]*?;`, "gi");
  return [...source.matchAll(pattern)].map((match) => match[0]);
}

describe("opportunity_intelligence migration — service-role-only tables", () => {
  for (const table of SERVICE_ROLE_ONLY_TABLES) {
    it(`enables RLS with zero client-facing policies on ${table}`, () => {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security;`));
      expect(policiesFor(sql, table)).toEqual([]);
    });
  }
});

describe("opportunity_intelligence migration — opportunities extension", () => {
  it("adds every new column as nullable or with a safe default (additive-only)", () => {
    const alterBlock = sql.match(/alter table public\.opportunities([\s\S]*?);/);
    expect(alterBlock).not.toBeNull();
    // Every `add column if not exists` for a `not null` column must carry a `default`.
    const notNullWithoutDefault = /add column if not exists \w+ [^,]*not null(?![^,]*default)/i;
    expect(alterBlock?.[0]).not.toMatch(notNullWithoutDefault);
  });

  it("constrains verification_status, deadline_status, application_status, and eligibility_status to fixed enums", () => {
    expect(sql).toMatch(/verification_status in \(\s*'unverified', 'partially_verified', 'verified', 'stale', 'rejected'\s*\)/);
    expect(sql).toMatch(/deadline_status in \(\s*'open', 'rolling', 'upcoming', 'closed', 'unknown'\s*\)/);
    expect(sql).toMatch(/application_status in \(\s*'accepting_applications', 'opening_soon', 'closed', 'unknown'\s*\)/);
    expect(sql).toMatch(/eligibility_status in \(\s*'defined', 'partially_defined', 'undefined'\s*\)/);
  });

  it("indexes every new status/scheduling column used by query.ts's default filters", () => {
    expect(sql).toMatch(/create index if not exists opportunities_verification_status_idx/);
    expect(sql).toMatch(/create index if not exists opportunities_deadline_status_idx/);
    expect(sql).toMatch(/create index if not exists opportunities_application_status_idx/);
    expect(sql).toMatch(/create index if not exists opportunities_next_verification_at_idx/);
  });
});

describe("opportunity_intelligence migration — review queue", () => {
  it("requires each review-queue row to point at an opportunity or a raw record", () => {
    expect(sql).toMatch(/opportunity_review_queue_target_check/);
  });
});

describe("opportunity_intelligence migration — at most one primary source link", () => {
  it("has a unique partial index enforcing one is_primary per opportunity", () => {
    expect(sql).toMatch(/opportunity_source_links_one_primary_idx/);
    expect(sql).toMatch(/where is_primary/);
  });
});

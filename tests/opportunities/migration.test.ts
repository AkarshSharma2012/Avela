import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../supabase/migrations/20260726000000_create_opportunities.sql"
);

const sql = readFileSync(MIGRATION_PATH, "utf-8");

/** Every `create policy ... on public.<table> ... for <op>` in the migration, grouped by table. */
function policyOperationsByTable(source: string, table: string): string[] {
  const pattern = new RegExp(
    `create policy[^;]*?on public\\.${table}[^;]*?for (select|insert|update|delete)`,
    "gi"
  );
  return [...source.matchAll(pattern)].map((match) => match[1].toLowerCase());
}

describe("opportunities migration — RLS shape", () => {
  it("enables row level security on both new tables", () => {
    expect(sql).toMatch(/alter table public\.opportunities enable row level security;/);
    expect(sql).toMatch(/alter table public\.saved_opportunities enable row level security;/);
  });

  it("grants opportunities only a select policy — no client-facing write path", () => {
    const operations = policyOperationsByTable(sql, "opportunities");
    expect(operations).toEqual(["select"]);
  });

  it("scopes the opportunities select policy to active rows only", () => {
    const selectPolicy = sql.match(/create policy[^;]*?on public\.opportunities[^;]*?for select[^;]*;/i);
    expect(selectPolicy).not.toBeNull();
    expect(selectPolicy?.[0]).toMatch(/using \(is_active = true\)/);
  });

  it("grants saved_opportunities select/insert/delete, but no update policy", () => {
    const operations = policyOperationsByTable(sql, "saved_opportunities").sort();
    expect(operations).toEqual(["delete", "insert", "select"]);
  });

  it("scopes every saved_opportunities policy to the caller's own user_id", () => {
    const pattern = /create policy[^;]*?on public\.saved_opportunities[^;]*?;/gi;
    const policies = [...sql.matchAll(pattern)].map((match) => match[0]);
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      expect(policy).toMatch(/auth\.uid\(\) = user_id/);
    }
  });

  it("never lets is_sample and is_verified both be true on the same row", () => {
    expect(sql).toMatch(/check \(\s*not \(is_sample and is_verified\)\s*\)/);
  });
});

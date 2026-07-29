import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(path.resolve(__dirname, "../../supabase/migrations/20260812000000_user_roles.sql"), "utf-8");

function policiesForTable(source: string, table: string): string[] {
  const pattern = new RegExp(`create policy[^;]*?on public\\.${table}[^;]*?;`, "gi");
  return [...source.matchAll(pattern)].map((m) => m[0]);
}

describe("user_roles", () => {
  it("constrains role to the four documented values", () => {
    expect(sql).toMatch(/role text not null check \(role in \('student', 'reviewer', 'admin', 'owner'\)\)/);
  });

  it("requires exactly one row per (user_id, role)", () => {
    expect(sql).toMatch(/constraint user_roles_one_row_per_user_role unique \(user_id, role\)/);
  });

  it("enables RLS but grants zero policies — not even a self-read for the user", () => {
    expect(sql).toMatch(/alter table public\.user_roles enable row level security;/);
    expect(policiesForTable(sql, "user_roles")).toEqual([]);
  });
});

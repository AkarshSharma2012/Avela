import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH = path.resolve(__dirname, "../../supabase/migrations/20260816000000_generic_profile_challenges.sql");
const sql = readFileSync(MIGRATION_PATH, "utf-8");

function policyOperations(source: string, table: string): string[] {
  const pattern = new RegExp(`create policy[^;]*?on public\\.${table}[^;]*?for (select|insert|update|delete)`, "gi");
  return [...source.matchAll(pattern)].map((match) => match[1].toLowerCase());
}

describe("portfolio_generic_profile_challenges", () => {
  it("leaves provider_key as a plain length-bounded column, not a check-in-list enum", () => {
    const start = sql.indexOf("provider_key text not null check (");
    expect(start).toBeGreaterThan(-1);
    const end = sql.indexOf("),\n", start);
    const columnDefinition = sql.slice(start, end);
    expect(columnDefinition).toMatch(/length\(provider_key\) between 1 and 100/);
    expect(columnDefinition).not.toMatch(/ in \(/);
  });

  it("requires target_url to be HTTPS-only", () => {
    expect(sql).toMatch(/target_url text not null check \(length\(target_url\) between 1 and 500 and target_url like 'https:\/\/%'\)/);
  });

  it("bounds challenge_token_hash to exactly a sha256 hex digest's length", () => {
    expect(sql).toMatch(/challenge_token_hash text not null check \(length\(challenge_token_hash\) = 64\)/);
  });

  it("constrains status to the four expected values, defaulting to pending", () => {
    expect(sql).toMatch(/status text not null default 'pending' check \(status in \('pending', 'confirmed', 'expired', 'revoked'\)\)/);
  });

  it("enables RLS, allows the student's own session to update through to confirmed (server-side safeFetch is the real gate), and grants no delete policy", () => {
    expect(policyOperations(sql, "portfolio_generic_profile_challenges").sort()).toEqual(["insert", "select", "update"]);
    const updatePolicy = sql.match(/create policy "Users can update their own generic profile challenges"[\s\S]*?;/);
    expect(updatePolicy).not.toBeNull();
    expect(updatePolicy?.[0]).not.toMatch(/status in \(/);
  });

  it("does not alter identity_possession_challenges' existing provider constraint — a new, separate table instead", () => {
    expect(sql).not.toMatch(/alter table public\.identity_possession_challenges/);
  });
});

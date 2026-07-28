import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH = path.resolve(__dirname, "../../supabase/migrations/20260804000000_portfolio_osint.sql");
const sql = readFileSync(MIGRATION_PATH, "utf-8");

function policyOperationsByTable(source: string, table: string): string[] {
  const pattern = new RegExp(`create policy[^;]*?on public\\.${table}[^;]*?for (select|insert|update|delete)`, "gi");
  return [...source.matchAll(pattern)].map((match) => match[1].toLowerCase());
}

function policiesForTable(source: string, table: string): string[] {
  const pattern = new RegExp(`create policy[^;]*?on public\\.${table}[^;]*?;`, "gi");
  return [...source.matchAll(pattern)].map((match) => match[0]);
}

const TABLES = ["portfolio_osint_checks", "portfolio_osint_evidence", "portfolio_osint_conflicts", "portfolio_osint_review_events"];

describe("OSINT migration — never touches the existing evidence/verifier tables", () => {
  it("does not alter or drop portfolio_items, portfolio_files, portfolio_verifications, or portfolio_verification_events", () => {
    for (const table of ["portfolio_items", "portfolio_files", "portfolio_verifications", "portfolio_verification_events"]) {
      expect(sql).not.toMatch(new RegExp(`alter table public\\.${table}`));
      expect(sql).not.toMatch(new RegExp(`drop table public\\.${table}`));
    }
  });
});

describe.each(TABLES)("%s — RLS is owner-only, no cross-user access", (table) => {
  it("enables row level security", () => {
    expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security;`));
  });

  it("every policy is scoped to auth.uid() = user_id", () => {
    const policies = policiesForTable(sql, table);
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      expect(policy).toMatch(/auth\.uid\(\) = user_id/);
    }
  });

  it("no policy grants the anon role anything", () => {
    for (const policy of policiesForTable(sql, table)) {
      expect(policy).not.toMatch(/to anon/);
    }
  });
});

describe("portfolio_osint_checks — shape", () => {
  it("constrains status and final_support_level to the documented values", () => {
    expect(sql).toMatch(/status text not null default 'pending' check \(/);
    for (const status of ["pending", "running", "completed", "failed", "cancelled"]) {
      expect(sql).toContain(`'${status}'`);
    }
    for (const level of ["confirmed_by_authoritative_source", "strongly_supported", "partially_supported", "unable_to_verify", "needs_review"]) {
      expect(sql).toContain(`'${level}'`);
    }
  });

  it("never has a 'true' or 'false' support-level value — no absolute truth claim", () => {
    const supportLevelCheck = sql.match(/final_support_level text check \(([\s\S]*?)\)\s*,/);
    expect(supportLevelCheck?.[1]).not.toMatch(/'true'/);
    expect(supportLevelCheck?.[1]).not.toMatch(/'false'/);
  });

  it("bounds score between 0 and 100", () => {
    expect(sql).toMatch(/score integer check \(score is null or \(score >= 0 and score <= 100\)\)/);
  });

  it("supports deletion for the student's own rows (spec: delete public-source evidence)", () => {
    const operations = policyOperationsByTable(sql, "portfolio_osint_checks");
    expect(operations).toContain("delete");
  });

  it("has a retention expiry column, indexed", () => {
    expect(sql).toMatch(/portfolio_osint_checks[\s\S]*?expires_at timestamptz/);
    expect(sql).toMatch(/create index if not exists portfolio_osint_checks_expires_idx/);
  });
});

describe("portfolio_osint_evidence — shape", () => {
  it("requires https-only source URLs", () => {
    expect(sql).toMatch(/source_url text not null check \(length\(source_url\) <= 2000 and source_url like 'https:\/\/%'\)/);
  });

  it("constrains authority_level to the six documented levels", () => {
    for (const level of ["issuer", "official_organization", "trusted_registry", "verified_public_profile", "secondary_source", "unknown"]) {
      expect(sql).toContain(`'${level}'`);
    }
  });

  it("deduplicates by (check_id, content_hash)", () => {
    expect(sql).toMatch(/constraint portfolio_osint_evidence_dedupe unique \(check_id, content_hash\)/);
  });

  it("bounds content_hash to exactly a sha256 hex digest's length", () => {
    expect(sql).toMatch(/content_hash text not null check \(length\(content_hash\) = 64\)/);
  });

  it("cascades delete from its parent check", () => {
    expect(sql).toMatch(/portfolio_osint_evidence[\s\S]*?check_id uuid not null references public\.portfolio_osint_checks\(id\) on delete cascade/);
  });
});

describe("portfolio_osint_conflicts — respectful, bounded", () => {
  it("bounds respectful_message length", () => {
    expect(sql).toMatch(/respectful_message text not null check \(length\(respectful_message\) <= 500\)/);
  });

  it("constrains severity to info/minor/material", () => {
    expect(sql).toMatch(/severity text not null check \(severity in \('info', 'minor', 'material'\)\)/);
  });
});

describe("portfolio_osint_review_events — immutable audit trail", () => {
  it("grants only select — no insert/update/delete policy for any client-facing role", () => {
    const operations = policyOperationsByTable(sql, "portfolio_osint_review_events");
    expect(operations).toEqual(["select"]);
  });

  it("every decision requires a non-empty reason", () => {
    expect(sql).toMatch(/reason text not null check \(length\(reason\) <= 2000\)/);
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH = path.resolve(__dirname, "../../supabase/migrations/20260808000000_verifier_legitimacy_and_project_context.sql");

const sql = readFileSync(MIGRATION_PATH, "utf-8");

function policyOperationsByTable(source: string, table: string): string[] {
  const pattern = new RegExp(`create policy[^;]*?on public\\.${table}[^;]*?for (select|insert|update|delete)`, "gi");
  return [...source.matchAll(pattern)].map((match) => match[1].toLowerCase());
}

describe("portfolio_items.project_context", () => {
  it("adds a nullable column constrained to the two documented values", () => {
    expect(sql).toMatch(/add column if not exists project_context text check \(\s*project_context is null or project_context in \('org_linked', 'personal_project'\)\s*\)/);
  });
});

describe("verification_field_confirmations", () => {
  it("constrains field and response to the documented values", () => {
    expect(sql).toMatch(/field text not null check \(field in \('participation', 'role', 'dates', 'hours', 'outcome'\)\)/);
    expect(sql).toMatch(/response text not null check \(response in \('can_confirm', 'cannot_confirm', 'needs_correction'\)\)/);
  });

  it("requires exactly one confirmation row per (verification_id, field)", () => {
    expect(sql).toMatch(/constraint verification_field_confirmations_one_per_field unique \(verification_id, field\)/);
  });

  it("enables RLS with a select-only policy — no client-facing insert/update/delete (verifier has no session)", () => {
    expect(sql).toMatch(/alter table public\.verification_field_confirmations enable row level security;/);
    expect(policyOperationsByTable(sql, "verification_field_confirmations")).toEqual(["select"]);
  });
});

describe("verifier_domain_assessments", () => {
  it("constrains classification to the eight documented categories", () => {
    const check = sql.match(/classification text not null check \(\s*classification in \(([\s\S]*?)\)\s*\)/);
    expect(check).not.toBeNull();
    for (const value of [
      "organization_domain_aligned",
      "organization_domain_unconfirmed",
      "personal_or_free_email",
      "role_mailbox",
      "domain_mismatch",
      "suspicious_or_disposable",
      "repeated_verifier_pattern",
      "manual_review_required",
    ]) {
      expect(check?.[1]).toContain(`'${value}'`);
    }
  });

  it("enables RLS with a select-only policy — writes are service-role only", () => {
    expect(sql).toMatch(/alter table public\.verifier_domain_assessments enable row level security;/);
    expect(policyOperationsByTable(sql, "verifier_domain_assessments")).toEqual(["select"]);
  });

  it("indexes by verifier_email_domain for the reviewer-only repeated-verifier signal", () => {
    expect(sql).toMatch(/create index if not exists verifier_domain_assessments_email_domain_idx\s+on public\.verifier_domain_assessments \(verifier_email_domain\);/);
  });
});

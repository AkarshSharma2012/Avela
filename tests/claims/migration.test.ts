import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH = path.resolve(__dirname, "../../supabase/migrations/20260806000000_claim_dimensions.sql");

const sql = readFileSync(MIGRATION_PATH, "utf-8");

const DIMENSIONS = [
  "identity_control",
  "project_or_activity_exists",
  "account_or_asset_control",
  "authorship_or_contribution",
  "role",
  "dates_and_duration",
  "organization_relationship",
  "award_or_credential",
  "output_or_deliverable",
  "impact_or_outcome",
  "third_party_confirmation",
];

const STATUSES = ["not_checked", "unable_to_verify", "partially_supported", "strongly_supported", "externally_confirmed", "needs_review"];

function policyOperationsByTable(source: string, table: string): string[] {
  const pattern = new RegExp(`create policy[^;]*?on public\\.${table}[^;]*?for (select|insert|update|delete)`, "gi");
  return [...source.matchAll(pattern)].map((match) => match[1].toLowerCase());
}

describe("claim_dimension_results — shape", () => {
  it("constrains dimension to the eleven documented values", () => {
    const check = sql.match(/dimension text not null check \(\s*dimension in \(([\s\S]*?)\)\s*\)\s*,/);
    expect(check).not.toBeNull();
    for (const dimension of DIMENSIONS) {
      expect(check?.[1]).toContain(`'${dimension}'`);
    }
  });

  it("constrains status to the six documented values, defaulting to not_checked", () => {
    const check = sql.match(/status text not null default 'not_checked' check \(([\s\S]*?)\)\s*,/);
    expect(check).not.toBeNull();
    for (const status of STATUSES) {
      expect(check?.[1]).toContain(`'${status}'`);
    }
  });

  it("requires exactly one row per (portfolio_item_id, dimension)", () => {
    expect(sql).toMatch(/constraint claim_dimension_results_one_per_item_dimension unique \(portfolio_item_id, dimension\)/);
  });

  it("defaults stale to false and evidence_ref to an empty object", () => {
    expect(sql).toMatch(/stale boolean not null default false/);
    expect(sql).toMatch(/evidence_ref jsonb not null default '\{\}'::jsonb/);
  });

  it("foreign-keys to auth.users and portfolio_items with cascade delete", () => {
    expect(sql).toMatch(/claim_dimension_results[\s\S]*?user_id uuid not null references auth\.users\(id\) on delete cascade/);
    expect(sql).toMatch(/portfolio_item_id uuid not null references public\.portfolio_items\(id\) on delete cascade,\n  dimension text/);
  });

  it("wires an updated_at trigger using the shared set_updated_at function", () => {
    expect(sql).toMatch(/create trigger claim_dimension_results_set_updated_at[\s\S]*?execute function public\.set_updated_at\(\);/);
  });
});

describe("claim_dimension_results — RLS", () => {
  it("enables row level security", () => {
    expect(sql).toMatch(/alter table public\.claim_dimension_results enable row level security;/);
  });

  it("grants only select/insert/update — no delete policy exists for students", () => {
    const operations = policyOperationsByTable(sql, "claim_dimension_results").sort();
    expect(operations).toEqual(["insert", "select", "update"]);
  });

  it("insert reverifies the portfolio item belongs to the caller", () => {
    const insertPolicy = sql.match(/create policy "Users can create their own claim dimension results"[\s\S]*?;/);
    expect(insertPolicy?.[0]).toMatch(/exists \(select 1 from public\.portfolio_items pi where pi\.id = portfolio_item_id and pi\.user_id = auth\.uid\(\)\)/);
  });
});

describe("claim_dimension_events — shape", () => {
  it("constrains actor_type to the four documented values", () => {
    expect(sql).toMatch(/actor_type text not null check \(actor_type in \('student', 'verifier', 'reviewer', 'system'\)\)/);
  });

  it("foreign-keys to claim_dimension_results with cascade delete", () => {
    expect(sql).toMatch(/dimension_result_id uuid not null references public\.claim_dimension_results\(id\) on delete cascade/);
  });
});

describe("claim_dimension_events — RLS (immutability)", () => {
  it("enables row level security", () => {
    expect(sql).toMatch(/alter table public\.claim_dimension_events enable row level security;/);
  });

  it("grants only select and insert — no update or delete policy exists for any role, ever", () => {
    const operations = policyOperationsByTable(sql, "claim_dimension_events").sort();
    expect(operations).toEqual(["insert", "select"]);
  });

  it("insert only allows actor_type='student' with new_status='partially_supported', always scoped to the caller", () => {
    const insertPolicy = sql.match(/create policy "Users can log their own claim dimension events"[\s\S]*?;/);
    expect(insertPolicy).not.toBeNull();
    expect(insertPolicy?.[0]).toMatch(/auth\.uid\(\) = user_id/);
    expect(insertPolicy?.[0]).toMatch(/actor_type = 'student'/);
    expect(insertPolicy?.[0]).toMatch(/new_status = 'partially_supported'/);
  });
});

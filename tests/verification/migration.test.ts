import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH = path.resolve(__dirname, "../../supabase/migrations/20260803000000_portfolio_verification.sql");

const sql = readFileSync(MIGRATION_PATH, "utf-8");

function policyOperationsByTable(source: string, table: string): string[] {
  const pattern = new RegExp(`create policy[^;]*?on public\\.${table}[^;]*?for (select|insert|update|delete)`, "gi");
  return [...source.matchAll(pattern)].map((match) => match[1].toLowerCase());
}

function policiesForTable(source: string, table: string): string[] {
  const pattern = new RegExp(`create policy[^;]*?on public\\.${table}[^;]*?;`, "gi");
  return [...source.matchAll(pattern)].map((match) => match[0]);
}

describe("portfolio_verifications — shape", () => {
  it("constrains verification_level to the five documented values, defaulting to unverified", () => {
    const check = sql.match(/verification_level text not null default 'unverified' check \(([\s\S]*?)\)\s*,/);
    expect(check).not.toBeNull();
    for (const level of ["unverified", "evidence_added", "externally_confirmed", "needs_review", "rejected"]) {
      expect(check?.[1]).toContain(`'${level}'`);
    }
  });

  it("constrains verification_method to the seven documented values, nullable", () => {
    const check = sql.match(/verification_method text check \(([\s\S]*?)\)\s*,/);
    expect(check).not.toBeNull();
    for (const method of [
      "uploaded_document",
      "official_url",
      "organization_email",
      "teacher_or_mentor",
      "recommendation_contact",
      "manual_review",
      "system_consistency_check",
    ]) {
      expect(check?.[1]).toContain(`'${method}'`);
    }
  });

  it("requires exactly one verification row per portfolio item", () => {
    expect(sql).toMatch(/constraint portfolio_verifications_one_per_item unique \(portfolio_item_id\)/);
  });

  it("foreign-keys to auth.users and portfolio_items with cascade delete", () => {
    expect(sql).toMatch(/portfolio_verifications[\s\S]*?user_id uuid not null references auth\.users\(id\) on delete cascade/);
    expect(sql).toMatch(/portfolio_item_id uuid not null references public\.portfolio_items\(id\) on delete cascade/);
  });

  it("requires evidence_url to be https-only when present", () => {
    expect(sql).toMatch(/evidence_url is null or \(length\(evidence_url\) <= 2000 and evidence_url like 'https:\/\/%'\)/);
  });

  it("bounds verification_code_hash to exactly a sha256 hex digest's length", () => {
    expect(sql).toMatch(/verification_code_hash text check \(verification_code_hash is null or length\(verification_code_hash\) = 64\)/);
  });

  it("indexes by user, by (user, level), by code hash, and by expiry", () => {
    expect(sql).toMatch(/create index if not exists portfolio_verifications_user_idx/);
    expect(sql).toMatch(/create index if not exists portfolio_verifications_level_idx/);
    expect(sql).toMatch(/create index if not exists portfolio_verifications_code_hash_idx/);
    expect(sql).toMatch(/create index if not exists portfolio_verifications_expires_idx/);
  });

  it("wires an updated_at trigger using the shared set_updated_at function", () => {
    expect(sql).toMatch(/create trigger portfolio_verifications_set_updated_at[\s\S]*?execute function public\.set_updated_at\(\);/);
  });
});

describe("portfolio_verifications — RLS", () => {
  it("enables row level security", () => {
    expect(sql).toMatch(/alter table public\.portfolio_verifications enable row level security;/);
  });

  it("grants only select/insert/update — no delete policy exists for students", () => {
    const operations = policyOperationsByTable(sql, "portfolio_verifications").sort();
    expect(operations).toEqual(["insert", "select", "update"]);
  });

  it("every policy is scoped to auth.uid() = user_id", () => {
    for (const policy of policiesForTable(sql, "portfolio_verifications")) {
      expect(policy).toMatch(/auth\.uid\(\) = user_id/);
    }
  });

  it("insert and update reverify a non-null evidence_file_id belongs to the same user AND the same item", () => {
    const insertPolicy = sql.match(/create policy "Users can create their own portfolio verifications"[\s\S]*?;\n\ncreate policy/);
    const updatePolicy = sql.match(/create policy "Users can update their own portfolio verifications"[\s\S]*?;/);
    expect(insertPolicy?.[0]).toMatch(/pf\.user_id = auth\.uid\(\) and pf\.portfolio_item_id = portfolio_item_id/);
    expect(updatePolicy?.[0]).toMatch(/pf\.user_id = auth\.uid\(\) and pf\.portfolio_item_id = portfolio_item_id/);
  });

  it("insert reverifies the portfolio item itself belongs to the caller", () => {
    const insertPolicy = sql.match(/create policy "Users can create their own portfolio verifications"[\s\S]*?;\n\ncreate policy/);
    expect(insertPolicy?.[0]).toMatch(/exists \(select 1 from public\.portfolio_items pi where pi\.id = portfolio_item_id and pi\.user_id = auth\.uid\(\)\)/);
  });
});

describe("portfolio_verification_events — shape", () => {
  it("constrains event_type and actor_type to the documented enums", () => {
    const eventCheck = sql.match(/event_type text not null check \(([\s\S]*?)\)\s*,/);
    for (const type of [
      "evidence_added",
      "evidence_replaced",
      "official_url_added",
      "verification_requested",
      "verification_resent",
      "verification_cancelled",
      "verification_confirmed",
      "verification_declined",
      "correction_requested",
      "verification_expired",
      "reviewer_decision",
      "consistency_check_run",
      "level_changed",
    ]) {
      expect(eventCheck?.[1]).toContain(`'${type}'`);
    }

    const actorCheck = sql.match(/actor_type text not null check \(actor_type in \(([\s\S]*?)\)\)/);
    for (const actor of ["student", "verifier", "reviewer", "system"]) {
      expect(actorCheck?.[1]).toContain(`'${actor}'`);
    }
  });

  it("foreign-keys to portfolio_verifications with cascade delete", () => {
    expect(sql).toMatch(/verification_id uuid not null references public\.portfolio_verifications\(id\) on delete cascade/);
  });

  it("indexes by user, by (verification, created_at), and by item", () => {
    expect(sql).toMatch(/create index if not exists portfolio_verification_events_user_idx/);
    expect(sql).toMatch(/create index if not exists portfolio_verification_events_verification_idx/);
    expect(sql).toMatch(/create index if not exists portfolio_verification_events_item_idx/);
  });
});

describe("portfolio_verification_events — RLS (immutability)", () => {
  it("enables row level security", () => {
    expect(sql).toMatch(/alter table public\.portfolio_verification_events enable row level security;/);
  });

  it("grants only select and insert — no update or delete policy exists for any role, ever", () => {
    const operations = policyOperationsByTable(sql, "portfolio_verification_events").sort();
    expect(operations).toEqual(["insert", "select"]);
  });

  it("insert only allows actor_type='student' (except a system-actor consistency_check_run), always scoped to the caller", () => {
    const insertPolicy = sql.match(/create policy "Users can log their own verification events"[\s\S]*?;/);
    expect(insertPolicy).not.toBeNull();
    expect(insertPolicy?.[0]).toMatch(/auth\.uid\(\) = user_id/);
    expect(insertPolicy?.[0]).toMatch(/actor_type = 'student' and event_type <> 'consistency_check_run'/);
    expect(insertPolicy?.[0]).toMatch(/actor_type = 'system' and event_type = 'consistency_check_run'/);
  });

  it("insert reverifies the verification row belongs to the same user and item", () => {
    const insertPolicy = sql.match(/create policy "Users can log their own verification events"[\s\S]*?;/);
    expect(insertPolicy?.[0]).toMatch(/pv\.user_id = auth\.uid\(\) and pv\.portfolio_item_id = portfolio_item_id/);
  });
});

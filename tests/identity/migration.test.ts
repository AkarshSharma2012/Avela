import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH = path.resolve(__dirname, "../../supabase/migrations/20260807000000_connected_identities.sql");

const sql = readFileSync(MIGRATION_PATH, "utf-8");

function policyOperationsByTable(source: string, table: string): string[] {
  const pattern = new RegExp(`create policy[^;]*?on public\\.${table}[^;]*?for (select|insert|update|delete)`, "gi");
  return [...source.matchAll(pattern)].map((match) => match[1].toLowerCase());
}

describe("connected_identities — anti-collusion constraints", () => {
  it("has a partial unique index on (provider, provider_subject) where active — no account can be linked to two students at once", () => {
    expect(sql).toMatch(
      /create unique index if not exists connected_identities_active_subject_idx\s+on public\.connected_identities \(provider, provider_subject\)\s+where disconnected_at is null;/
    );
  });

  it("has a partial unique index on (user_id, provider) where active — reconnecting never creates a second active row", () => {
    expect(sql).toMatch(
      /create unique index if not exists connected_identities_active_user_provider_idx\s+on public\.connected_identities \(user_id, provider\)\s+where disconnected_at is null;/
    );
  });

  it("constrains provider to a known list", () => {
    expect(sql).toMatch(/provider text not null check \(provider in \('github'\)\)/);
  });
});

describe("connected_identities — RLS", () => {
  it("enables row level security", () => {
    expect(sql).toMatch(/alter table public\.connected_identities enable row level security;/);
  });

  it("grants only select/insert/update — no delete policy (disconnect is a soft-delete via disconnected_at)", () => {
    const operations = policyOperationsByTable(sql, "connected_identities").sort();
    expect(operations).toEqual(["insert", "select", "update"]);
  });

  it("every policy is scoped to auth.uid() = user_id", () => {
    const policies = [...sql.matchAll(/create policy[^;]*?on public\.connected_identities[^;]*?;/gi)].map((m) => m[0]);
    for (const policy of policies) {
      expect(policy).toMatch(/auth\.uid\(\) = user_id/);
    }
  });
});

describe("connected_identity_events — immutability and actor restriction", () => {
  it("enables row level security", () => {
    expect(sql).toMatch(/alter table public\.connected_identity_events enable row level security;/);
  });

  it("grants only select and insert — no update or delete for any role", () => {
    const operations = policyOperationsByTable(sql, "connected_identity_events").sort();
    expect(operations).toEqual(["insert", "select"]);
  });

  it("only allows a client session to log actor_type='student' events, scoped to their own identity row", () => {
    const insertPolicy = sql.match(/create policy "Users can log their own connected identity events"[\s\S]*?;/);
    expect(insertPolicy?.[0]).toMatch(/actor_type = 'student'/);
    expect(insertPolicy?.[0]).toMatch(/ci\.user_id = auth\.uid\(\)/);
  });
});

describe("identity_possession_challenges — shape and RLS", () => {
  it("bounds challenge_token_hash to exactly a sha256 hex digest's length", () => {
    expect(sql).toMatch(/challenge_token_hash text not null check \(length\(challenge_token_hash\) = 64\)/);
  });

  it("requires target_identifier to be an https URL", () => {
    expect(sql).toMatch(/target_identifier text not null check \(length\(target_identifier\) between 1 and 500 and target_identifier like 'https:\/\/%'\)/);
  });

  it("constrains status to the four documented values, defaulting to pending", () => {
    expect(sql).toMatch(/status text not null default 'pending' check \(status in \('pending', 'confirmed', 'expired', 'revoked'\)\)/);
  });

  it("enables row level security with no delete policy", () => {
    expect(sql).toMatch(/alter table public\.identity_possession_challenges enable row level security;/);
    const operations = policyOperationsByTable(sql, "identity_possession_challenges").sort();
    expect(operations).toEqual(["insert", "select", "update"]);
  });
});

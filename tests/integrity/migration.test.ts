import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(path.resolve(__dirname, "../../supabase/migrations/20260811000000_integrity_signals.sql"), "utf-8");

function policiesForTable(source: string, table: string): string[] {
  const pattern = new RegExp(`create policy[^;]*?on public\\.${table}[^;]*?;`, "gi");
  return [...source.matchAll(pattern)].map((m) => m[0]);
}

describe("integrity_signals — never client-facing", () => {
  it("enables RLS but grants zero policies of any kind — reviewer/service-role only", () => {
    expect(sql).toMatch(/alter table public\.integrity_signals enable row level security;/);
    expect(policiesForTable(sql, "integrity_signals")).toEqual([]);
  });

  it("constrains signal_type to the twelve documented patterns", () => {
    const check = sql.match(/signal_type text not null check \(\s*signal_type in \(([\s\S]*?)\)\s*\)/);
    expect(check).not.toBeNull();
    for (const value of [
      "repeated_evidence_hash",
      "near_identical_narrative",
      "verifier_reused_across_students",
      "circular_student_verification",
      "domain_mismatch_or_suspicious",
      "request_velocity",
      "edit_shortly_after_confirmation",
      "request_spam_cancel_cycle",
      "connect_disconnect_around_verification",
      "fork_history_copied",
      "verifier_scope_narrower_than_claim",
      "split_project_farming",
    ]) {
      expect(check?.[1]).toContain(`'${value}'`);
    }
  });

  it("constrains risk_level to the four documented levels, never including a rejection-like value", () => {
    expect(sql).toMatch(/risk_level text not null default 'normal' check \(\s*risk_level in \('normal', 'additional_evidence_recommended', 'manual_review', 'temporarily_limited'\)\s*\)/);
  });
});

describe("integrity_reviews — never client-facing, append-only", () => {
  it("enables RLS but grants zero policies", () => {
    expect(sql).toMatch(/alter table public\.integrity_reviews enable row level security;/);
    expect(policiesForTable(sql, "integrity_reviews")).toEqual([]);
  });

  it("requires a non-empty reason for every decision", () => {
    expect(sql).toMatch(/reason text not null check \(length\(reason\) between 1 and 2000\)/);
  });
});

describe("rate_limit_counters — never client-facing", () => {
  it("enables RLS but grants zero policies", () => {
    expect(sql).toMatch(/alter table public\.rate_limit_counters enable row level security;/);
    expect(policiesForTable(sql, "rate_limit_counters")).toEqual([]);
  });

  it("has a unique constraint on (user_id, bucket, window_start) for race-safe atomic increments", () => {
    expect(sql).toMatch(/constraint rate_limit_counters_unique_window unique \(user_id, bucket, window_start\)/);
  });
});

describe("increment_rate_limit_counter() — resolves identity server-side, never trusts a client-supplied id", () => {
  it("raises when auth.uid() is null rather than silently proceeding", () => {
    expect(sql).toMatch(/if auth\.uid\(\) is null then\s*raise exception/);
  });

  it("is granted to authenticated but not to public", () => {
    expect(sql).toMatch(/revoke all on function public\.increment_rate_limit_counter\(text, timestamptz\) from public;/);
    expect(sql).toMatch(/grant execute on function public\.increment_rate_limit_counter\(text, timestamptz\) to authenticated;/);
  });
});

describe("increment_rate_limit_counter_for_user() — service_role only, never authenticated or public", () => {
  it("is granted only to service_role", () => {
    expect(sql).toMatch(/revoke all on function public\.increment_rate_limit_counter_for_user\(uuid, text, timestamptz\) from public;/);
    expect(sql).toMatch(/grant execute on function public\.increment_rate_limit_counter_for_user\(uuid, text, timestamptz\) to service_role;/);
    expect(sql).not.toMatch(/grant execute on function public\.increment_rate_limit_counter_for_user\(uuid, text, timestamptz\) to authenticated;/);
  });
});

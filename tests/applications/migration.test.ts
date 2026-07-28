import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../supabase/migrations/20260731000000_application_plans.sql"
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

function policiesForTable(source: string, table: string): string[] {
  const pattern = new RegExp(`create policy[^;]*?on public\\.${table}[^;]*?;`, "gi");
  return [...source.matchAll(pattern)].map((match) => match[0]);
}

describe("application_plans/application_tasks migration — shape", () => {
  it("constrains status to the eight documented values", () => {
    const statuses = [
      "interested",
      "planning",
      "preparing",
      "ready_to_apply",
      "applied",
      "accepted",
      "rejected",
      "withdrawn",
    ];
    const statusCheck = sql.match(/status text not null default 'planning' check \(([\s\S]*?)\)\s*,/);
    expect(statusCheck).not.toBeNull();
    for (const status of statuses) {
      expect(statusCheck?.[1]).toContain(`'${status}'`);
    }
  });

  it("requires exactly one plan per (user, opportunity)", () => {
    expect(sql).toMatch(/unique \(user_id, opportunity_id\)/);
  });

  it("foreign-keys plans and tasks to auth.users and opportunities with cascade delete", () => {
    expect(sql).toMatch(/user_id uuid not null references auth\.users\(id\) on delete cascade/);
    expect(sql).toMatch(/opportunity_id uuid not null references public\.opportunities\(id\) on delete cascade/);
    expect(sql).toMatch(/application_plan_id uuid not null references public\.application_plans\(id\) on delete cascade/);
  });

  it("indexes application_plans by user, by (user, status), and by both deadline columns", () => {
    expect(sql).toMatch(/create index if not exists application_plans_user_idx\s+on public\.application_plans \(user_id\);/);
    expect(sql).toMatch(/create index if not exists application_plans_user_status_idx\s+on public\.application_plans \(user_id, status\);/);
    expect(sql).toMatch(/create index if not exists application_plans_target_submit_date_idx/);
    expect(sql).toMatch(/create index if not exists application_plans_official_deadline_idx/);
  });

  it("indexes application_tasks by plan, by user, and by due date", () => {
    expect(sql).toMatch(/create index if not exists application_tasks_plan_idx\s+on public\.application_tasks \(application_plan_id, sort_order\);/);
    expect(sql).toMatch(/create index if not exists application_tasks_user_idx/);
    expect(sql).toMatch(/create index if not exists application_tasks_due_date_idx/);
  });

  it("wires updated_at triggers on both tables using the shared set_updated_at function", () => {
    expect(sql).toMatch(/create trigger application_plans_set_updated_at[\s\S]*?execute function public\.set_updated_at\(\);/);
    expect(sql).toMatch(/create trigger application_tasks_set_updated_at[\s\S]*?execute function public\.set_updated_at\(\);/);
  });
});

describe("application_plans/application_tasks migration — RLS", () => {
  it("enables row level security on both tables", () => {
    expect(sql).toMatch(/alter table public\.application_plans enable row level security;/);
    expect(sql).toMatch(/alter table public\.application_tasks enable row level security;/);
  });

  it("grants application_plans full select/insert/update/delete, all scoped to auth.uid()", () => {
    const operations = policyOperationsByTable(sql, "application_plans").sort();
    expect(operations).toEqual(["delete", "insert", "select", "update"]);

    for (const policy of policiesForTable(sql, "application_plans")) {
      expect(policy).toMatch(/auth\.uid\(\) = user_id/);
    }
  });

  it("grants application_tasks full select/insert/update/delete, all scoped to auth.uid()", () => {
    const operations = policyOperationsByTable(sql, "application_tasks").sort();
    expect(operations).toEqual(["delete", "insert", "select", "update"]);

    for (const policy of policiesForTable(sql, "application_tasks")) {
      expect(policy).toMatch(/auth\.uid\(\) = user_id/);
    }
  });

  it("never trusts a client-supplied user_id when accessing another student's plans or tasks — every policy scopes to auth.uid()", () => {
    const allPolicies = [
      ...policiesForTable(sql, "application_plans"),
      ...policiesForTable(sql, "application_tasks"),
    ];
    expect(allPolicies.length).toBeGreaterThan(0);
    for (const policy of allPolicies) {
      expect(policy).toMatch(/auth\.uid\(\) = user_id/);
    }
  });

  it("insert/update on application_tasks additionally reverifies the parent plan is owned by the same student", () => {
    const insertPolicy = sql.match(/create policy "Users can create tasks on their own application plans"[\s\S]*?;/);
    const updatePolicy = sql.match(/create policy "Users can update their own application tasks"[\s\S]*?;/);
    expect(insertPolicy).not.toBeNull();
    expect(updatePolicy).not.toBeNull();
    expect(insertPolicy?.[0]).toMatch(/exists \(\s*select 1 from public\.application_plans p/);
    expect(updatePolicy?.[0]).toMatch(/exists \(\s*select 1 from public\.application_plans p/);
  });
});

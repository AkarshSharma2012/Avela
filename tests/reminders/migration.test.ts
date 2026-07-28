import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH = path.resolve(__dirname, "../../supabase/migrations/20260801000000_student_reminders.sql");

const sql = readFileSync(MIGRATION_PATH, "utf-8");

function policyOperationsByTable(source: string, table: string): string[] {
  const pattern = new RegExp(`create policy[^;]*?on public\\.${table}[^;]*?for (select|insert|update|delete)`, "gi");
  return [...source.matchAll(pattern)].map((match) => match[1].toLowerCase());
}

function policiesForTable(source: string, table: string): string[] {
  const pattern = new RegExp(`create policy[^;]*?on public\\.${table}[^;]*?;`, "gi");
  return [...source.matchAll(pattern)].map((match) => match[0]);
}

describe("student_reminders migration — shape", () => {
  it("constrains reminder_type to the six documented values", () => {
    const types = [
      "opportunity_deadline",
      "target_submit_date",
      "application_task",
      "custom",
      "follow_up",
      "recommendation_reminder",
    ];
    const typeCheck = sql.match(/reminder_type text not null check \(([\s\S]*?)\)\s*,/);
    expect(typeCheck).not.toBeNull();
    for (const type of types) {
      expect(typeCheck?.[1]).toContain(`'${type}'`);
    }
  });

  it("constrains source to the five documented values", () => {
    const sources = ["automatic", "student_created", "recommendation_feedback", "application_plan", "application_task"];
    const sourceCheck = sql.match(/source text not null check \(([\s\S]*?)\)\s*,/);
    expect(sourceCheck).not.toBeNull();
    for (const source of sources) {
      expect(sourceCheck?.[1]).toContain(`'${source}'`);
    }
  });

  it("requires every reminder to belong to the authenticated user, cascading on delete", () => {
    expect(sql).toMatch(/user_id uuid not null references auth\.users\(id\) on delete cascade/);
  });

  it("cascades from opportunity, plan, and task references so a deleted target never leaves an orphaned reminder", () => {
    expect(sql).toMatch(/opportunity_id uuid references public\.opportunities\(id\) on delete cascade/);
    expect(sql).toMatch(/application_plan_id uuid references public\.application_plans\(id\) on delete cascade/);
    expect(sql).toMatch(/application_task_id uuid references public\.application_tasks\(id\) on delete cascade/);
  });

  it("requires a real target or an explicitly custom/follow-up type", () => {
    expect(sql).toMatch(/constraint student_reminders_has_target_or_title check/);
    expect(sql).toMatch(/reminder_type in \('custom', 'follow_up'\)/);
  });

  it("requires title to be non-empty", () => {
    expect(sql).toMatch(/title text not null check \(length\(trim\(title\)\) > 0\)/);
  });

  it("ties each reminder_type to the one target column it actually needs", () => {
    const constraint = sql.match(/constraint student_reminders_type_target check \(([\s\S]*?)\)\s*,/);
    expect(constraint).not.toBeNull();
    expect(constraint?.[1]).toContain("reminder_type = 'opportunity_deadline' and opportunity_id is not null");
    expect(constraint?.[1]).toContain("reminder_type = 'target_submit_date' and application_plan_id is not null");
    expect(constraint?.[1]).toContain("reminder_type = 'application_task' and application_task_id is not null");
    expect(constraint?.[1]).toContain("reminder_type = 'recommendation_reminder' and opportunity_id is not null");
  });

  it("ties each reminder_type to the one source it actually carries", () => {
    const constraint = sql.match(/constraint student_reminders_type_source check \(([\s\S]*?)\)\s*,/);
    expect(constraint).not.toBeNull();
    expect(constraint?.[1]).toContain("reminder_type = 'opportunity_deadline' and source = 'automatic'");
    expect(constraint?.[1]).toContain("reminder_type = 'target_submit_date' and source = 'application_plan'");
    expect(constraint?.[1]).toContain("reminder_type = 'application_task' and source = 'application_task'");
    expect(constraint?.[1]).toContain("reminder_type = 'recommendation_reminder' and source = 'recommendation_feedback'");
    expect(constraint?.[1]).toContain("reminder_type in ('custom', 'follow_up') and source = 'student_created'");
  });

  it("prevents duplicate automatic reminders with a partial unique index on (user_id, dedupe_key)", () => {
    expect(sql).toMatch(
      /create unique index if not exists student_reminders_dedupe_idx\s+on public\.student_reminders \(user_id, dedupe_key\)\s+where dedupe_key is not null;/
    );
  });

  it("indexes by user, by (user, remind_at), and by each target column", () => {
    expect(sql).toMatch(/create index if not exists student_reminders_user_idx\s+on public\.student_reminders \(user_id\);/);
    expect(sql).toMatch(
      /create index if not exists student_reminders_user_remind_at_idx\s+on public\.student_reminders \(user_id, remind_at\);/
    );
    expect(sql).toMatch(/create index if not exists student_reminders_opportunity_idx/);
    expect(sql).toMatch(/create index if not exists student_reminders_plan_idx/);
    expect(sql).toMatch(/create index if not exists student_reminders_task_idx/);
  });

  it("wires an updated_at trigger using the shared set_updated_at function", () => {
    expect(sql).toMatch(/create trigger student_reminders_set_updated_at[\s\S]*?execute function public\.set_updated_at\(\);/);
  });
});

describe("student_reminders migration — RLS", () => {
  it("enables row level security", () => {
    expect(sql).toMatch(/alter table public\.student_reminders enable row level security;/);
  });

  it("grants full select/insert/update/delete, all scoped to auth.uid()", () => {
    const operations = policyOperationsByTable(sql, "student_reminders").sort();
    expect(operations).toEqual(["delete", "insert", "select", "update"]);

    for (const policy of policiesForTable(sql, "student_reminders")) {
      expect(policy).toMatch(/auth\.uid\(\) = user_id/);
    }
  });

  it("never trusts a client-supplied user_id — every policy scopes to auth.uid(), never another column", () => {
    const policies = policiesForTable(sql, "student_reminders");
    expect(policies.length).toBe(4);
    for (const policy of policies) {
      expect(policy).toMatch(/auth\.uid\(\) = user_id/);
    }
  });
});

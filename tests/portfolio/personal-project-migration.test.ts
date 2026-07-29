import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH = path.resolve(__dirname, "../../supabase/migrations/20260809000000_personal_project_details.sql");

const sql = readFileSync(MIGRATION_PATH, "utf-8");

function policyOperationsByTable(source: string, table: string): string[] {
  const pattern = new RegExp(`create policy[^;]*?on public\\.${table}[^;]*?for (select|insert|update|delete)`, "gi");
  return [...source.matchAll(pattern)].map((match) => match[1].toLowerCase());
}

describe("portfolio_personal_project_details", () => {
  it("requires the three short-prompt answers, non-null", () => {
    expect(sql).toMatch(/what_you_made text not null check \(length\(what_you_made\) between 1 and 600\)/);
    expect(sql).toMatch(/why_you_made_it text not null check \(length\(why_you_made_it\) between 1 and 600\)/);
    expect(sql).toMatch(/your_part text not null check \(length\(your_part\) between 1 and 600\)/);
  });

  it("makes every extended prompt optional (nullable)", () => {
    for (const column of ["made_for", "problem_or_goal", "tools_or_materials", "difficult_or_interesting", "result", "improvement_ideas", "collaborators"]) {
      expect(sql).toMatch(new RegExp(`${column} text check \\(${column} is null or`));
    }
  });

  it("requires exactly one row per item — no organization column exists at all on this table", () => {
    expect(sql).toMatch(/constraint portfolio_personal_project_details_one_per_item unique \(portfolio_item_id\)/);
    expect(sql).not.toMatch(/create table if not exists public\.portfolio_personal_project_details[\s\S]*?organization/);
  });

  it("enables RLS with no delete policy for the student", () => {
    expect(policyOperationsByTable(sql, "portfolio_personal_project_details").sort()).toEqual(["insert", "select", "update"]);
  });
});

describe("portfolio_files: evidence_role + content_hash", () => {
  it("constrains evidence_role to the fourteen documented values, nullable", () => {
    const check = sql.match(/evidence_role text check \(\s*evidence_role is null or evidence_role in \(([\s\S]*?)\)\s*\)/);
    expect(check).not.toBeNull();
    for (const value of [
      "concept_or_plan",
      "sketch_or_draft",
      "materials_or_tools",
      "work_in_progress",
      "final_artifact",
      "demonstration",
      "reflection",
      "collaborator_confirmation",
      "supervisor_confirmation",
      "customer_or_recipient_confirmation",
      "event_or_display",
      "receipt_or_material_record",
      "process_log",
      "other",
    ]) {
      expect(check?.[1]).toContain(`'${value}'`);
    }
  });

  it("bounds content_hash to exactly a sha256 hex digest's length when present", () => {
    expect(sql).toMatch(/content_hash text check \(content_hash is null or length\(content_hash\) = 64\)/);
  });
});

describe("portfolio_possession_challenges", () => {
  it("bounds challenge_token_hash to exactly a sha256 hex digest's length", () => {
    expect(sql).toMatch(/challenge_token_hash text not null check \(length\(challenge_token_hash\) = 64\)/);
  });

  it("enables RLS and grants no delete policy", () => {
    expect(policyOperationsByTable(sql, "portfolio_possession_challenges").sort()).toEqual(["insert", "select", "update"]);
  });

  it("blocks a client session from ever setting status to confirmed itself", () => {
    const updatePolicy = sql.match(/create policy "Users can update their own possession challenges but never self-confirm"[\s\S]*?;/);
    expect(updatePolicy).not.toBeNull();
    expect(updatePolicy?.[0]).toMatch(/status in \('pending', 'expired', 'revoked'\)/);
    expect(updatePolicy?.[0]).not.toMatch(/'confirmed'/);
  });
});

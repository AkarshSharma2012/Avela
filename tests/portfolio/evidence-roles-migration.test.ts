import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function policyOperationsByTable(source: string, table: string): string[] {
  const pattern = new RegExp(`create policy[^;]*?on public\\.${table}[^;]*?for (select|insert|update|delete)`, "gi");
  return [...source.matchAll(pattern)].map((match) => match[1].toLowerCase());
}

describe("portfolio_files.evidence_role widening", () => {
  const sql = readFileSync(
    path.resolve(__dirname, "../../supabase/migrations/20260814000000_evidence_roles_expansion.sql"),
    "utf-8"
  );

  it("drops the old auto-named constraint before re-adding it", () => {
    expect(sql).toMatch(/drop constraint if exists portfolio_files_evidence_role_check/);
  });

  it("keeps all fourteen original values plus the eight Milestone 10.8 additions, all nullable", () => {
    const check = sql.match(/portfolio_files_evidence_role_check check \(([\s\S]*?)\);/);
    expect(check).not.toBeNull();
    expect(check?.[1]).toMatch(/evidence_role is null or evidence_role in/);
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
      "research_or_notes",
      "performance",
      "data_or_results",
      "code_or_source",
      "publication",
      "official_result",
      "teacher_confirmation",
      "coach_confirmation",
      "possession_or_control",
    ]) {
      expect(check?.[1]).toContain(`'${value}'`);
    }
  });
});

describe("portfolio_entry_narrative and portfolio_team_* tables", () => {
  const sql = readFileSync(
    path.resolve(__dirname, "../../supabase/migrations/20260815000000_entry_narrative_and_team_details.sql"),
    "utf-8"
  );

  it("requires the three universal short-prompt answers, non-null", () => {
    expect(sql).toMatch(/what_you_did text not null check \(length\(what_you_did\) between 1 and 600\)/);
    expect(sql).toMatch(/why_you_did_it text not null check \(length\(why_you_did_it\) between 1 and 600\)/);
    expect(sql).toMatch(/your_part text not null check \(length\(your_part\) between 1 and 600\)/);
  });

  it("makes all seven optional narrative prompts nullable", () => {
    for (const column of ["who_it_helped", "materials_or_tools", "collaborators", "challenges", "result", "what_you_learned", "would_improve"]) {
      expect(sql).toMatch(new RegExp(`${column} text check \\(${column} is null or`));
    }
  });

  it("enforces exactly one narrative row per item", () => {
    expect(sql).toMatch(/constraint portfolio_entry_narrative_one_per_item unique \(portfolio_item_id\)/);
  });

  it("enables RLS on portfolio_entry_narrative with no delete policy for the student", () => {
    expect(policyOperationsByTable(sql, "portfolio_entry_narrative").sort()).toEqual(["insert", "select", "update"]);
  });

  it("keeps team_output and personal_contribution as separate columns, never merged", () => {
    expect(sql).toMatch(/team_output text check \(team_output is null or/);
    expect(sql).toMatch(/personal_contribution text check \(personal_contribution is null or/);
  });

  it("enforces exactly one team-details row per item and grants no delete policy", () => {
    expect(sql).toMatch(/constraint portfolio_team_details_one_per_item unique \(portfolio_item_id\)/);
    expect(policyOperationsByTable(sql, "portfolio_team_details").sort()).toEqual(["insert", "select", "update"]);
  });

  it("requires only a name (not null) for a team collaborator — email and role are nullable", () => {
    expect(sql).toMatch(/name text not null check \(length\(trim\(name\)\) > 0 and length\(name\) <= 200\)/);
    expect(sql).toMatch(/email text check \(email is null or/);
    expect(sql).toMatch(/role text check \(role is null or/);
  });

  it("grants full CRUD on portfolio_team_collaborators, unlike the state-only narrative/details tables", () => {
    expect(policyOperationsByTable(sql, "portfolio_team_collaborators").sort()).toEqual(["delete", "insert", "select", "update"]);
  });
});

import { describe, expect, it } from "vitest";

import { EVIDENCE_ROLES, EVIDENCE_ROLE_LABELS } from "@/lib/portfolio/evidence-roles";

describe("EVIDENCE_ROLES", () => {
  it("covers all 23 spec section 11 evidence roles (14 original + 9 Milestone 10.8 additions)", () => {
    expect(EVIDENCE_ROLES.length).toBe(23);
  });

  it("has a friendly label for every role, distinct from its internal value", () => {
    for (const entry of EVIDENCE_ROLES) {
      expect(entry.label).not.toBe(entry.value);
      expect(entry.label.includes("_")).toBe(false);
    }
  });

  it("includes every Milestone 10.7 original role plus the Milestone 10.8 additions", () => {
    const values = EVIDENCE_ROLES.map((entry) => entry.value);
    for (const original of [
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
      expect(values).toContain(original);
    }
    for (const addition of [
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
      expect(values).toContain(addition);
    }
  });

  it("has unique values", () => {
    const values = EVIDENCE_ROLES.map((entry) => entry.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("EVIDENCE_ROLE_LABELS", () => {
  it("has a label entry for every role", () => {
    for (const entry of EVIDENCE_ROLES) {
      expect(EVIDENCE_ROLE_LABELS[entry.value]).toBe(entry.label);
    }
  });
});

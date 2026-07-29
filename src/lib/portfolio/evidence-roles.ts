/**
 * Student-facing labels for portfolio_files.evidence_role (spec section
 * 11) — same {value, label} + derived Record pattern as
 * PORTFOLIO_ITEM_TYPES in constants.ts. Category-specific suggestions live
 * in templates.ts (each CategoryTemplate's suggestedEvidenceRoles), not
 * here, so there's exactly one place that maps a category to its evidence
 * roles.
 */

import type { PortfolioFileEvidenceRole } from "@/types/database";

export const EVIDENCE_ROLES: readonly { value: PortfolioFileEvidenceRole; label: string }[] = [
  { value: "concept_or_plan", label: "Concept or plan" },
  { value: "sketch_or_draft", label: "Sketch or draft" },
  { value: "materials_or_tools", label: "Materials or tools" },
  { value: "work_in_progress", label: "Work in progress" },
  { value: "final_artifact", label: "Final result" },
  { value: "demonstration", label: "Demonstration" },
  { value: "reflection", label: "Reflection" },
  { value: "collaborator_confirmation", label: "Collaborator confirmation" },
  { value: "supervisor_confirmation", label: "Supervisor confirmation" },
  { value: "customer_or_recipient_confirmation", label: "Customer or recipient confirmation" },
  { value: "event_or_display", label: "Event or display" },
  { value: "receipt_or_material_record", label: "Receipt or material record" },
  { value: "process_log", label: "Process log" },
  { value: "research_or_notes", label: "Research or notes" },
  { value: "performance", label: "Performance" },
  { value: "data_or_results", label: "Data or results" },
  { value: "code_or_source", label: "Code or source" },
  { value: "publication", label: "Publication" },
  { value: "official_result", label: "Official result" },
  { value: "teacher_confirmation", label: "Teacher confirmation" },
  { value: "coach_confirmation", label: "Coach confirmation" },
  { value: "possession_or_control", label: "Possession or control" },
  { value: "other", label: "Other" },
];

export const EVIDENCE_ROLE_LABELS: Record<PortfolioFileEvidenceRole, string> = Object.fromEntries(
  EVIDENCE_ROLES.map((option) => [option.value, option.label])
) as Record<PortfolioFileEvidenceRole, string>;

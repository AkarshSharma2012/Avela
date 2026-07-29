/**
 * Claim-snapshot hashing and material-vs-cosmetic edit classification
 * (spec section 8). Verification/claim-dimension trust applies to the
 * exact version of a claim that was actually checked — this module decides
 * whether a new save is still "the same claim, described slightly
 * differently" or a real change that should stale/downgrade dependent
 * support.
 *
 * Two different comparison strategies, deliberately:
 *  - Structural fields (organization, role, dates, hours, project context,
 *    url) are compared after whitespace/case normalization only — any
 *    remaining difference is material. These are the fields spec section 8
 *    explicitly lists as material-change examples, and none of them
 *    benefit from fuzzy tolerance (an organization either changed or it
 *    didn't).
 *  - Free-text fields (title, description, outcome) use textSimilarity
 *    (reused from osint/matching.ts, the same Sorensen-Dice logic that
 *    already backs every other fuzzy comparison in this codebase) so a
 *    spelling fix or reworded sentence with the same meaning doesn't
 *    invalidate anything, while a genuinely different claim does.
 */

import { normalizeText, textSimilarity } from "@/lib/osint/matching";
import type { PortfolioItem } from "@/types/portfolio";
import type { PortfolioItemProjectContext } from "@/types/database";

export type MaterialSnapshotFields = {
  title: string;
  organization: string | null;
  role: string | null;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
  outcome: string | null;
  hoursPerWeek: number | null;
  weeksPerYear: number | null;
  projectContext: PortfolioItemProjectContext | null;
  url: string | null;
};

export type MaterialFieldName = keyof MaterialSnapshotFields;

const STRUCTURAL_FIELDS: readonly MaterialFieldName[] = [
  "organization",
  "role",
  "startDate",
  "endDate",
  "hoursPerWeek",
  "weeksPerYear",
  "projectContext",
  "url",
];

const FUZZY_FIELDS: readonly MaterialFieldName[] = ["title", "description", "outcome"];

/** Below this, a free-text field's edit is treated as material rather than cosmetic. */
export const MATERIAL_TEXT_SIMILARITY_THRESHOLD = 0.85;

/** Deterministic, stable-key-order JSON so the same logical snapshot always hashes identically regardless of object construction order. */
function canonicalize(snapshot: MaterialSnapshotFields): string {
  const normalized: Record<string, unknown> = {};
  const keys = Object.keys(snapshot).sort() as MaterialFieldName[];
  for (const key of keys) {
    const value = snapshot[key];
    normalized[key] = typeof value === "string" ? normalizeText(value) : value;
  }
  return JSON.stringify(normalized);
}

export async function computeMaterialHash(snapshot: MaterialSnapshotFields): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(canonicalize(snapshot)).digest("hex");
}

function structuralFieldsEqual(a: MaterialSnapshotFields[MaterialFieldName], b: MaterialSnapshotFields[MaterialFieldName]): boolean {
  if (typeof a === "string" || typeof b === "string") {
    return normalizeText(typeof a === "string" ? a : "") === normalizeText(typeof b === "string" ? b : "");
  }
  return a === b;
}

export type EditClassification = {
  isMaterial: boolean;
  changedFields: MaterialFieldName[];
};

export function classifyEdit(previous: MaterialSnapshotFields, next: MaterialSnapshotFields): EditClassification {
  const changedFields: MaterialFieldName[] = [];

  for (const field of STRUCTURAL_FIELDS) {
    if (!structuralFieldsEqual(previous[field], next[field])) changedFields.push(field);
  }

  for (const field of FUZZY_FIELDS) {
    const prevValue = (previous[field] as string | null) ?? "";
    const nextValue = (next[field] as string | null) ?? "";
    if (prevValue === nextValue) continue;
    if (textSimilarity(prevValue, nextValue) < MATERIAL_TEXT_SIMILARITY_THRESHOLD) changedFields.push(field);
  }

  return { isMaterial: changedFields.length > 0, changedFields };
}

/** Neutral, student-facing field names for the "which field changed" audit reason (spec section 8) — never a value judgment about the change itself. */
export const MATERIAL_FIELD_LABELS: Record<MaterialFieldName, string> = {
  title: "title",
  organization: "organization",
  role: "role",
  startDate: "start date",
  endDate: "end date",
  description: "description",
  outcome: "outcome",
  hoursPerWeek: "hours per week",
  weeksPerYear: "weeks per year",
  projectContext: "project type",
  url: "link",
};

export function buildMaterialChangeReason(changedFields: MaterialFieldName[]): string {
  const labels = changedFields.map((field) => MATERIAL_FIELD_LABELS[field]);
  return `The ${labels.join(", ")} changed since this was last checked.`;
}

export function snapshotFromItem(item: PortfolioItem): MaterialSnapshotFields {
  return {
    title: item.title,
    organization: item.organization,
    role: item.role,
    startDate: item.start_date,
    endDate: item.end_date,
    description: item.description,
    outcome: item.outcome,
    hoursPerWeek: item.hours_per_week,
    weeksPerYear: item.weeks_per_year,
    projectContext: item.project_context,
    url: item.url,
  };
}

/** Applies a Partial<PortfolioItemFields>-shaped update onto an existing item's snapshot — undefined means "unchanged," matching how updatePortfolioItemForUser only patches fields actually present in the input. */
export function applyFieldPatchToSnapshot(
  base: MaterialSnapshotFields,
  patch: Partial<{
    title: string;
    organization: string | null;
    role: string | null;
    startDate: string | null;
    endDate: string | null;
    description: string | null;
    outcome: string | null;
    hoursPerWeek: number | null;
    weeksPerYear: number | null;
    projectContext: PortfolioItemProjectContext | null;
    url: string | null;
  }>
): MaterialSnapshotFields {
  return {
    title: patch.title ?? base.title,
    organization: patch.organization !== undefined ? patch.organization : base.organization,
    role: patch.role !== undefined ? patch.role : base.role,
    startDate: patch.startDate !== undefined ? patch.startDate : base.startDate,
    endDate: patch.endDate !== undefined ? patch.endDate : base.endDate,
    description: patch.description !== undefined ? patch.description : base.description,
    outcome: patch.outcome !== undefined ? patch.outcome : base.outcome,
    hoursPerWeek: patch.hoursPerWeek !== undefined ? patch.hoursPerWeek : base.hoursPerWeek,
    weeksPerYear: patch.weeksPerYear !== undefined ? patch.weeksPerYear : base.weeksPerYear,
    projectContext: patch.projectContext !== undefined ? patch.projectContext : base.projectContext,
    url: patch.url !== undefined ? patch.url : base.url,
  };
}

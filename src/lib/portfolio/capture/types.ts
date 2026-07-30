/**
 * Types for the guided capture flow's "Avela's Draft" step (spec Part 1
 * Card 2, Part 8). Draft generation here is deterministic-only — no AI
 * writes a draft field in this milestone; only src/lib/ai/evidence-grader
 * exists for judging evidence support once a claim already exists. Every
 * field a draft produces is always editable and always traceable to where
 * it came from, per spec Part 1 Card 2's "clearly indicate which values
 * were entered / extracted / suggested / confirmed."
 */

export type FieldOrigin = "student" | "extracted" | "suggested";

export type CaptureMethod = "link" | "upload" | "photo" | "connect" | "text";

export type CaptureInput =
  | { method: "text"; text: string }
  | { method: "link"; url: string }
  | { method: "upload"; filename: string; mimeType: string }
  | { method: "photo"; filename: string; mimeType: string }
  | { method: "connect"; provider: "github"; repoFullName: string };

export type DetectedEvidence = {
  sourceKind: string;
  label: string;
  url: string | null;
  extractionStatus: string;
};

export type DraftField<T> = { value: T; origin: FieldOrigin };

export type CaptureDraft = {
  title: DraftField<string>;
  activityCategoryKey: DraftField<string | null>;
  organization: DraftField<string | null>;
  description: DraftField<string>;
  startDate: DraftField<string | null>;
  skills: DraftField<string[]>;
  detectedEvidence: DetectedEvidence[];
  /** Never asserted as fact — a category-aware prompt only, filled in by the student on Card 3. */
  suggestedPersonalRolePrompt: string;
};

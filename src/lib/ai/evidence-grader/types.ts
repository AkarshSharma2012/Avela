/**
 * Provider-neutral input/output contract for EvidenceSupportGrader (spec
 * Part 6). Server-only — never imported by a Client Component. Input is
 * always pre-normalized text: never raw file bytes, images, audio, or
 * video (spec Part 7 — treat the model as text-in/text-out unless proven
 * otherwise). OCR/transcript text is fine; the encoded media itself is not.
 */

import type { EvidenceGraderOutput } from "@/lib/ai/evidence-grader/schema";

export type EvidenceSummaryInput = {
  /** How this evidence arrived — see PortfolioFileSourceKind. Purely descriptive context for the model, never a legitimacy signal by itself. */
  sourceKind: string;
  /** Truncated, already-extracted text (OCR output, transcript, webpage text, README, etc.) — never a data: URI or raw binary. */
  extractedText: string;
  label: string | null;
};

export type DeterministicCheckSummary = {
  dimension: string;
  status: string;
};

export type EvidenceGraderInput = {
  itemTitle: string;
  itemCategory: string | null;
  itemDescription: string | null;
  studentClaimedRole: string | null;
  studentExplanationOfContribution: string | null;
  claimedStartDate: string | null;
  claimedEndDate: string | null;
  claimedOrganization: string | null;
  /** Bounded — callers truncate to a handful of the most relevant artifacts before calling grade(). */
  evidence: readonly EvidenceSummaryInput[];
  /** What deterministic checks already found, so the model isn't asked to re-litigate what's already conclusively known. */
  deterministicChecks: readonly DeterministicCheckSummary[];
};

export type EvidenceGraderResult =
  | { ok: true; output: EvidenceGraderOutput; providerName: string; mocked: boolean }
  | { ok: false; reason: "disabled" | "timeout" | "malformed_response" | "provider_error"; providerName: string };

export interface EvidenceGraderProvider {
  readonly name: string;
  /** False when no key/config is present — the caller never attempts grade() in that case. */
  isConfigured(): boolean;
  /** Must reject via AbortSignal by `timeoutMs`, never hang indefinitely. */
  grade(input: EvidenceGraderInput, opts: { timeoutMs: number; signal: AbortSignal }): Promise<unknown>;
}

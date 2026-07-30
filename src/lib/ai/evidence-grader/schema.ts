/**
 * Strict runtime schema for EvidenceSupportGrader output (spec Part 6).
 * Malformed provider output is rejected, never coerced — a caller that gets
 * `null` back from parseGraderOutput() must fall back to deterministic-only
 * support, exactly like a disabled or timed-out provider (see index.ts).
 *
 * Every array/string is length-bounded: this is a defense against a
 * misbehaving or malicious provider response blowing up storage or a
 * render, not just a formatting nicety.
 */

import { z } from "zod";

/** Never a raw 0-100 "verified" score — this feeds internal claim-dimension logic only, and is capped below externally_confirmed (see index.ts's toClaimDimensionStatus). */
export const aiSupportLevelSchema = z.enum(["not_supported", "partially_supported", "strongly_supported", "conflicting"]);
export type AiSupportLevel = z.infer<typeof aiSupportLevelSchema>;

const shortString = z.string().trim().min(1).max(300);
const explanationString = z.string().trim().min(1).max(600);

/**
 * Words the grader must never use about a student, enforced twice: once in
 * the system prompt (see nvidia-provider.ts) and again here at the schema
 * boundary — a provider that slips past the prompt instruction still gets
 * rejected outright rather than silently displayed to anyone.
 */
const ACCUSATORY_WORDS = ["lying", "liar", "lied", "fraud", "fraudulent", "cheat", "cheated", "cheating", "fake", "faked", "dishonest", "dishonesty", "scam"];

function containsAccusatoryLanguage(value: string): boolean {
  const lower = value.toLowerCase();
  return ACCUSATORY_WORDS.some((word) => lower.includes(word));
}

const noAccusationString = <T extends z.ZodString>(schema: T) =>
  schema.refine((value) => !containsAccusatoryLanguage(value), { message: "must not use accusatory language" });

export const evidenceGraderOutputSchema = z.object({
  artifact_relevance: z.enum(["relevant", "irrelevant", "unclear"]),
  project_existence_support: aiSupportLevelSchema,
  ownership_control_support: aiSupportLevelSchema,
  personal_contribution_support: aiSupportLevelSchema,
  role_support: aiSupportLevelSchema,
  date_support: aiSupportLevelSchema,
  organization_support: aiSupportLevelSchema,
  outcome_support: aiSupportLevelSchema,
  award_result_support: aiSupportLevelSchema,
  process_support: aiSupportLevelSchema,
  detected_consistencies: z.array(noAccusationString(shortString)).max(8),
  detected_gaps: z.array(noAccusationString(shortString)).max(8),
  /** Neutral phrasing only ("dates don't overlap") — never "the student is lying about dates." Enforced by containsAccusatoryLanguage above. */
  possible_conflicts: z.array(noAccusationString(shortString)).max(8),
  suggested_next_evidence: noAccusationString(shortString).nullable(),
  confidence: z.number().min(0).max(1),
  short_explanation: noAccusationString(explanationString),
});

export type EvidenceGraderOutput = z.infer<typeof evidenceGraderOutputSchema>;

/** Parses and validates a provider's raw JSON text. Returns null (never throws) on any malformation — every caller treats null exactly like "provider unavailable." */
export function parseGraderOutput(raw: unknown): EvidenceGraderOutput | null {
  const result = evidenceGraderOutputSchema.safeParse(raw);
  return result.success ? result.data : null;
}

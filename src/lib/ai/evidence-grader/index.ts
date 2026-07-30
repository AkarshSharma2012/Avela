/**
 * EvidenceSupportGrader entry point (spec Part 6) — server-only. Picks a
 * provider from config, applies a timeout and bounded retry, validates
 * output against the strict schema, and always degrades to `{ ok: false }`
 * rather than throwing. Every caller (capture draft assembly, claim
 * dimension enrichment) must treat `{ ok: false }` exactly like "AI is
 * unavailable" — portfolio creation and saving must keep working.
 *
 * This module never stores chain-of-thought (only the parsed final JSON
 * ever leaves nvidia-provider.ts) and never exposes NVIDIA_API_KEY to a
 * caller.
 */

import { evidenceGraderOutputSchema, type AiSupportLevel } from "@/lib/ai/evidence-grader/schema";
import { getConfiguredProviderName, getGraderMaxRetries, getGraderTimeoutMs } from "@/lib/ai/evidence-grader/config";
import { createMockEvidenceGraderProvider } from "@/lib/ai/evidence-grader/mock-provider";
import { createNvidiaEvidenceGraderProvider } from "@/lib/ai/evidence-grader/nvidia-provider";
import type { EvidenceGraderInput, EvidenceGraderProvider, EvidenceGraderResult } from "@/lib/ai/evidence-grader/types";

const MAX_EVIDENCE_ITEMS = 6;
const MAX_EXTRACTED_TEXT_CHARS = 1500;

/** Bounds what actually reaches a provider — defense-in-depth against an oversized prompt regardless of what a caller assembled. */
function boundInput(input: EvidenceGraderInput): EvidenceGraderInput {
  return {
    ...input,
    evidence: input.evidence.slice(0, MAX_EVIDENCE_ITEMS).map((e) => ({ ...e, extractedText: e.extractedText.slice(0, MAX_EXTRACTED_TEXT_CHARS) })),
  };
}

function resolveProvider(): EvidenceGraderProvider | null {
  const name = getConfiguredProviderName();
  if (name === "mock") return createMockEvidenceGraderProvider();
  if (name === "nvidia") {
    const provider = createNvidiaEvidenceGraderProvider();
    return provider.isConfigured() ? provider : null;
  }
  return null;
}

async function callWithTimeout(provider: EvidenceGraderProvider, input: EvidenceGraderInput, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await provider.grade(input, { timeoutMs, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The one public entry point. Never throws. `mocked: true` in a successful
 * result means the mock provider produced it — callers that want to be
 * explicit in UI/reports about real-vs-mocked coverage can key off that.
 */
export async function gradeEvidence(input: EvidenceGraderInput): Promise<EvidenceGraderResult> {
  const provider = resolveProvider();
  if (!provider) {
    return { ok: false, reason: "disabled", providerName: getConfiguredProviderName() };
  }

  const bounded = boundInput(input);
  const timeoutMs = getGraderTimeoutMs();
  const maxAttempts = 1 + getGraderMaxRetries();

  let lastReason: Extract<EvidenceGraderResult, { ok: false }>["reason"] = "provider_error";
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const raw = await callWithTimeout(provider, bounded, timeoutMs);
      const parsed = evidenceGraderOutputSchema.safeParse(raw);
      if (!parsed.success) {
        lastReason = "malformed_response";
        continue;
      }
      return { ok: true, output: parsed.data, providerName: provider.name, mocked: provider.name === "mock" };
    } catch (error) {
      lastReason = error instanceof Error && error.name === "AbortError" ? "timeout" : "provider_error";
    }
  }

  return { ok: false, reason: lastReason, providerName: provider.name };
}

/**
 * Caps an AI-suggested support level at what AI alone is ever allowed to
 * imply for a claim dimension (spec Part 6: "AI analysis alone must never
 * create Confirmed"). 'strongly_supported' is the ceiling; 'externally_confirmed'
 * can only ever be set by a deterministic control check or a real
 * third-party confirmation (see src/lib/claims/repository.ts).
 */
export function aiSupportLevelToClaimDimensionStatus(level: AiSupportLevel): "not_checked" | "unable_to_verify" | "partially_supported" | "strongly_supported" | "needs_review" {
  switch (level) {
    case "not_supported":
      return "not_checked";
    case "partially_supported":
      return "partially_supported";
    case "strongly_supported":
      return "strongly_supported";
    case "conflicting":
      return "needs_review";
  }
}

export type { EvidenceGraderInput, EvidenceGraderResult } from "@/lib/ai/evidence-grader/types";
export type { EvidenceGraderOutput } from "@/lib/ai/evidence-grader/schema";

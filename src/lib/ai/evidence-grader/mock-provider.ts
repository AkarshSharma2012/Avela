/**
 * Deterministic, offline mock provider — no network, no API key, always
 * "configured." Used by tests and by AI_EVIDENCE_GRADER_PROVIDER=mock. Its
 * output is a plain function of the input (same input -> same output,
 * always), so tests can assert exact values instead of "some AI-shaped
 * object came back."
 *
 * The heuristic itself is intentionally crude — it exists to exercise the
 * grader interface and downstream integration, not to be a real evidence
 * judge. It must never be mistaken for the NVIDIA provider's actual
 * judgment quality.
 */

import type { EvidenceGraderProvider, EvidenceGraderInput } from "@/lib/ai/evidence-grader/types";
import type { AiSupportLevel } from "@/lib/ai/evidence-grader/schema";

function levelFromCount(count: number, strongThreshold: number): AiSupportLevel {
  if (count === 0) return "not_supported";
  return count >= strongThreshold ? "strongly_supported" : "partially_supported";
}

export function createMockEvidenceGraderProvider(): EvidenceGraderProvider {
  return {
    name: "mock",
    isConfigured: () => true,
    async grade(input: EvidenceGraderInput) {
      const evidenceCount = input.evidence.length;
      const hasOrgEvidence = input.evidence.some((e) => e.extractedText.toLowerCase().includes((input.claimedOrganization ?? "\0").toLowerCase()));
      const hasRoleText = Boolean(input.studentClaimedRole && input.studentExplanationOfContribution);
      const hasDateText = Boolean(input.claimedStartDate);
      const hasOutcomeText = Boolean(input.itemDescription && input.itemDescription.length > 40);

      return {
        artifact_relevance: evidenceCount > 0 ? "relevant" : "unclear",
        project_existence_support: levelFromCount(evidenceCount, 2),
        ownership_control_support: input.evidence.some((e) => e.sourceKind === "git_repository") ? "strongly_supported" : "not_supported",
        personal_contribution_support: hasRoleText ? levelFromCount(evidenceCount, 2) : "not_supported",
        role_support: hasRoleText ? "partially_supported" : "not_supported",
        date_support: hasDateText ? "partially_supported" : "not_supported",
        organization_support: input.claimedOrganization ? (hasOrgEvidence ? "strongly_supported" : "partially_supported") : "not_supported",
        outcome_support: hasOutcomeText ? "partially_supported" : "not_supported",
        award_result_support: "not_supported",
        process_support: evidenceCount > 1 ? "partially_supported" : "not_supported",
        detected_consistencies: evidenceCount > 0 ? ["Evidence was provided alongside the written description."] : [],
        detected_gaps: evidenceCount === 0 ? ["No evidence was attached to this item yet."] : [],
        possible_conflicts: [],
        suggested_next_evidence: evidenceCount === 0 ? "Add a link, file, or photo that shows this work." : null,
        confidence: Math.min(0.3 + evidenceCount * 0.15, 0.9),
        short_explanation: `Mock grader: ${evidenceCount} evidence item(s) considered alongside the student's own description.`,
      };
    },
  };
}

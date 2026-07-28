/**
 * Missing-evidence *suggestions* for an application's Evidence section —
 * never a claim that the application actually requires anything. A
 * suggestion only ever fires when an opportunity's own requirement flag is
 * explicitly `true`; `null` (unknown, the common case for most listings)
 * or `false` (confirmed not required) never produce one, per "do not
 * claim an application requires evidence unless it is explicitly known."
 * Every suggestion's own label is prefixed "Suggested:" so the UI can't
 * accidentally present it as a hard requirement.
 */

import { EVIDENCE_PURPOSE_LABELS } from "@/lib/portfolio/constants";
import type { EvidencePurpose } from "@/types/database";

export type MissingEvidenceSuggestion = { purpose: EvidencePurpose; label: string };

export type OpportunityEvidenceFlags = {
  essay_required: boolean | null;
  recommendation_required: boolean | null;
  transcript_required: boolean | null;
};

const REQUIREMENT_TO_PURPOSE: readonly { flag: keyof OpportunityEvidenceFlags; purpose: EvidencePurpose }[] = [
  { flag: "essay_required", purpose: "essay" },
  { flag: "recommendation_required", purpose: "recommendation" },
  { flag: "transcript_required", purpose: "transcript" },
];

export function suggestMissingEvidence(
  opportunity: OpportunityEvidenceFlags,
  existingPurposes: ReadonlySet<EvidencePurpose>
): MissingEvidenceSuggestion[] {
  return REQUIREMENT_TO_PURPOSE.filter(({ flag, purpose }) => opportunity[flag] === true && !existingPurposes.has(purpose)).map(
    ({ purpose }) => ({
      purpose,
      label: `Suggested: add ${EVIDENCE_PURPOSE_LABELS[purpose].toLowerCase()} evidence`,
    })
  );
}

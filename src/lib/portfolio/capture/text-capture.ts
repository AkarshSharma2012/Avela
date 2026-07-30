/**
 * Deterministic draft from a short freeform description (spec Part 1 Card 1
 * "Type a quick description" -> Card 2 draft). No network, no AI — a
 * student typing "I built a go-kart with my dad" always gets a draft back
 * instantly, even fully offline.
 */

import { guessCategoryFromText } from "@/lib/portfolio/capture/category-guess";
import type { CaptureDraft } from "@/lib/portfolio/capture/types";

const MAX_TITLE_LENGTH = 80;

/** Takes the text up to the first sentence boundary (or the whole thing, truncated) as a working title — always editable, never presented as final. */
function deriveTitleFromText(text: string): string {
  const trimmed = text.trim();
  const firstSentenceMatch = trimmed.match(/^[^.!?\n]+/);
  const candidate = (firstSentenceMatch?.[0] ?? trimmed).trim();
  if (candidate.length <= MAX_TITLE_LENGTH) return candidate;
  return `${candidate.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`;
}

export function draftFromText(text: string): CaptureDraft {
  const trimmed = text.trim();
  const category = guessCategoryFromText(trimmed);

  return {
    title: { value: deriveTitleFromText(trimmed), origin: "extracted" },
    activityCategoryKey: { value: category.key, origin: "suggested" },
    organization: { value: null, origin: "extracted" },
    description: { value: trimmed, origin: "student" },
    startDate: { value: null, origin: "extracted" },
    skills: { value: [], origin: "suggested" },
    detectedEvidence: [],
    suggestedPersonalRolePrompt: "",
  };
}

/**
 * The universal three-prompt entry narrative (spec section 3) — the same
 * "don't reward word count" validation shape as personal-project.ts, but
 * used by the low-friction wizard for every category/context, not just
 * personal/physical projects. Deliberately a separate module and a
 * separate table (portfolio_entry_narrative) rather than a rework of
 * personal-project.ts / portfolio_personal_project_details — see
 * 20260815000000_entry_narrative_and_team_details.sql's comment.
 */

const MAX_SHORT_ANSWER_LENGTH = 600;
const MAX_OPTIONAL_LONG_ANSWER_LENGTH = 600;
const MAX_OPTIONAL_SHORT_ANSWER_LENGTH = 400;

export type EntryNarrativeRequiredInput = {
  whatYouDid: string;
  whyYouDidIt: string;
  yourPart: string;
};

export type EntryNarrativeOptionalInput = {
  whoItHelped?: string | null;
  materialsOrTools?: string | null;
  collaborators?: string | null;
  challenges?: string | null;
  result?: string | null;
  whatYouLearned?: string | null;
  wouldImprove?: string | null;
};

export type EntryNarrativeInput = EntryNarrativeRequiredInput & EntryNarrativeOptionalInput;

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

/** Blocks empty/whitespace-only filler — never rejects a short, honest one-sentence answer. */
export function validateRequiredNarrativeAnswer(value: string, fieldLabel: string): string | null {
  if (isBlank(value)) return `Tell us ${fieldLabel} — a sentence or two is enough.`;
  if (value.length > MAX_SHORT_ANSWER_LENGTH) return "That answer is a bit long — try trimming it to a sentence or two.";
  return null;
}

export function validateOptionalNarrativeAnswer(value: string | null | undefined, max: number = MAX_OPTIONAL_LONG_ANSWER_LENGTH): string | null {
  if (!value) return null;
  if (value.length > max) return "That answer is a bit long — try trimming it down.";
  return null;
}

export type EntryNarrativeValidationResult = { valid: true } | { valid: false; error: string };

export function validateEntryNarrativeInput(input: EntryNarrativeInput): EntryNarrativeValidationResult {
  const requiredChecks: [string, string][] = [
    [input.whatYouDid, "what you did or made"],
    [input.whyYouDidIt, "why you did it"],
    [input.yourPart, "what part you personally completed"],
  ];
  for (const [value, label] of requiredChecks) {
    const error = validateRequiredNarrativeAnswer(value, label);
    if (error) return { valid: false, error };
  }

  const optionalChecks: [string | null | undefined, number][] = [
    [input.whoItHelped, MAX_OPTIONAL_SHORT_ANSWER_LENGTH],
    [input.materialsOrTools, MAX_OPTIONAL_LONG_ANSWER_LENGTH],
    [input.collaborators, MAX_OPTIONAL_SHORT_ANSWER_LENGTH],
    [input.challenges, MAX_OPTIONAL_LONG_ANSWER_LENGTH],
    [input.result, MAX_OPTIONAL_LONG_ANSWER_LENGTH],
    [input.whatYouLearned, MAX_OPTIONAL_LONG_ANSWER_LENGTH],
    [input.wouldImprove, MAX_OPTIONAL_LONG_ANSWER_LENGTH],
  ];
  for (const [value, max] of optionalChecks) {
    const error = validateOptionalNarrativeAnswer(value, max);
    if (error) return { valid: false, error };
  }

  return { valid: true };
}

/** Same purpose as personal-project.ts's buildInternalNarrative — internal consistency/similarity checks only, never shown as a single blob and never itself treated as external confirmation. */
export function buildInternalEntryNarrative(input: EntryNarrativeInput): string {
  return [
    input.whatYouDid,
    input.whyYouDidIt,
    input.yourPart,
    input.whoItHelped,
    input.materialsOrTools,
    input.collaborators,
    input.challenges,
    input.result,
    input.whatYouLearned,
    input.wouldImprove,
  ]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ");
}

/**
 * A minimal shape either narrative source can be read as, for display/
 * scoring code that doesn't care which table an item's narrative actually
 * lives in.
 */
export type ResolvedEntryNarrative = {
  whatYouDid: string;
  whyYouDidIt: string;
  yourPart: string;
  source: "entry_narrative" | "personal_project_details";
};

type EntryNarrativeLike = { what_you_did: string; why_you_did_it: string; your_part: string } | null;
type PersonalProjectDetailsLike = { what_you_made: string; why_you_made_it: string; your_part: string } | null;

/**
 * Prefers the Milestone 10.8 universal narrative table; falls back to the
 * Milestone 10.7 personal-project table for items created before this
 * migration existed. Never merges or prefers partial data from either —
 * exactly one source wins per item.
 */
export function resolveEntryNarrative(entryNarrative: EntryNarrativeLike, personalProjectDetails: PersonalProjectDetailsLike): ResolvedEntryNarrative | null {
  if (entryNarrative) {
    return {
      whatYouDid: entryNarrative.what_you_did,
      whyYouDidIt: entryNarrative.why_you_did_it,
      yourPart: entryNarrative.your_part,
      source: "entry_narrative",
    };
  }
  if (personalProjectDetails) {
    return {
      whatYouDid: personalProjectDetails.what_you_made,
      whyYouDidIt: personalProjectDetails.why_you_made_it,
      yourPart: personalProjectDetails.your_part,
      source: "personal_project_details",
    };
  }
  return null;
}

/**
 * The personal/physical/creative project flow (spec section 6/7) — three
 * short required prompts, several optional ones. Pure validation only; no
 * word-count reward, no long-essay requirement. A single required-field
 * check catches empty/whitespace-only submissions; nothing here scores or
 * ranks based on how much a student wrote.
 */

const MAX_SHORT_ANSWER_LENGTH = 600;
const MAX_OPTIONAL_LONG_ANSWER_LENGTH = 600;
const MAX_OPTIONAL_SHORT_ANSWER_LENGTH = 400;

export type PersonalProjectRequiredInput = {
  whatYouMade: string;
  whyYouMadeIt: string;
  yourPart: string;
};

export type PersonalProjectOptionalInput = {
  madeFor?: string | null;
  problemOrGoal?: string | null;
  toolsOrMaterials?: string | null;
  difficultOrInteresting?: string | null;
  result?: string | null;
  improvementIdeas?: string | null;
  collaborators?: string | null;
};

export type PersonalProjectInput = PersonalProjectRequiredInput & PersonalProjectOptionalInput;

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

/** Blocks empty/whitespace-only filler (spec section 6) — never rejects a short, honest one-sentence answer. */
export function validateRequiredShortAnswer(value: string, fieldLabel: string): string | null {
  if (isBlank(value)) return `Tell us ${fieldLabel} — a sentence or two is enough.`;
  if (value.length > MAX_SHORT_ANSWER_LENGTH) return `That answer is a bit long — try trimming it to a sentence or two.`;
  return null;
}

export function validateOptionalAnswer(value: string | null | undefined, max: number = MAX_OPTIONAL_LONG_ANSWER_LENGTH): string | null {
  if (!value) return null;
  if (value.length > max) return "That answer is a bit long — try trimming it down.";
  return null;
}

export type PersonalProjectValidationResult = { valid: true } | { valid: false; error: string };

export function validatePersonalProjectInput(input: PersonalProjectInput): PersonalProjectValidationResult {
  const requiredChecks: [string, string][] = [
    [input.whatYouMade, "what you made"],
    [input.whyYouMadeIt, "why you made it"],
    [input.yourPart, "what part you personally completed"],
  ];
  for (const [value, label] of requiredChecks) {
    const error = validateRequiredShortAnswer(value, label);
    if (error) return { valid: false, error };
  }

  const optionalChecks: [string | null | undefined, number][] = [
    [input.madeFor, MAX_OPTIONAL_SHORT_ANSWER_LENGTH],
    [input.problemOrGoal, MAX_OPTIONAL_LONG_ANSWER_LENGTH],
    [input.toolsOrMaterials, MAX_OPTIONAL_LONG_ANSWER_LENGTH],
    [input.difficultOrInteresting, MAX_OPTIONAL_LONG_ANSWER_LENGTH],
    [input.result, MAX_OPTIONAL_LONG_ANSWER_LENGTH],
    [input.improvementIdeas, MAX_OPTIONAL_LONG_ANSWER_LENGTH],
    [input.collaborators, MAX_OPTIONAL_SHORT_ANSWER_LENGTH],
  ];
  for (const [value, max] of optionalChecks) {
    const error = validateOptionalAnswer(value, max);
    if (error) return { valid: false, error };
  }

  return { valid: true };
}

/**
 * Combines the answers into one internal string for consistency/similarity
 * checks (e.g. near-duplicate-narrative detection, spec section 9) — never
 * shown to anyone as a single blob, and never itself treated as external
 * confirmation (spec section 6: "text alone never creates external
 * confirmation").
 */
export function buildInternalNarrative(input: PersonalProjectInput): string {
  return [
    input.whatYouMade,
    input.whyYouMadeIt,
    input.yourPart,
    input.madeFor,
    input.problemOrGoal,
    input.toolsOrMaterials,
    input.difficultOrInteresting,
    input.result,
    input.improvementIdeas,
    input.collaborators,
  ]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ");
}

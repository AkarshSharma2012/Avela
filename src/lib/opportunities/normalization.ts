import type { OpportunityCostType } from "@/types/database";

/**
 * Every normalizer returns this shape instead of a bare value: `confidence`
 * tells a caller (the ranking/review-queue/UI layers) whether it's safe to
 * treat `value` as a verified fact or whether it should still be shown with
 * the original `raw` text and a review flag. `value` is `null` whenever the
 * input couldn't be parsed deterministically — never a guess. See the spec's
 * "Never invent a deadline, grade range, location, or cost. Unknown must
 * remain unknown."
 */
export type NormalizedField<T> = {
  value: T | null;
  confidence: "high" | "low";
  raw: string;
};

function field<T>(value: T | null, confidence: "high" | "low", raw: string): NormalizedField<T> {
  return { value, confidence, raw };
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Trims and collapses whitespace only — never rewrites capitalization/wording, since that would fabricate certainty about the "real" title. */
export function normalizeTitle(raw: string): NormalizedField<string> {
  const cleaned = collapseWhitespace(raw);
  if (cleaned.length === 0) return field<string>(null, "low", raw);
  return field(cleaned, "high", raw);
}

export function normalizeOrganization(raw: string): NormalizedField<string> {
  const cleaned = collapseWhitespace(raw).replace(/^(by|from)\s+/i, "");
  if (cleaned.length === 0) return field<string>(null, "low", raw);
  return field(cleaned, "high", raw);
}

const GRADE_WORD_TO_NUMBER: Record<string, number> = {
  sixth: 6, "6th": 6,
  seventh: 7, "7th": 7,
  eighth: 8, "8th": 8,
  ninth: 9, "9th": 9,
  tenth: 10, "10th": 10,
  eleventh: 11, "11th": 11,
  twelfth: 12, "12th": 12,
};

export type GradeRange = { minGrade: number | null; maxGrade: number | null };

/**
 * Parses free-text grade descriptions into a structured range. Handles the
 * three forms the spec calls out explicitly ("9th–12th grade", "grades 9
 * through 12", "high school students") plus a few equivalent variants.
 * Anything it doesn't recognize returns `value: null` at low confidence
 * rather than guessing a range — the raw text is preserved for a human or
 * the review queue to resolve.
 */
export function normalizeGradeRange(raw: string): NormalizedField<GradeRange> {
  const text = raw.toLowerCase().trim();
  if (text.length === 0) return field<GradeRange>(null, "low", raw);

  if (/\bmiddle school\b/.test(text)) return field({ minGrade: 6, maxGrade: 8 }, "high", raw);
  if (/\bhigh school\b/.test(text)) return field({ minGrade: 9, maxGrade: 12 }, "high", raw);

  // "grades 9 through 12", "grades 9-12", "9th-12th grade", "9th to 12th grade"
  const numericRange = text.match(
    /(?:grades?\s*)?(\d{1,2})(?:th|st|nd|rd)?\s*(?:-|–|—|to|through)\s*(\d{1,2})(?:th|st|nd|rd)?\s*(?:grade|grader)?/
  );
  if (numericRange) {
    const min = Number.parseInt(numericRange[1], 10);
    const max = Number.parseInt(numericRange[2], 10);
    if (min >= 1 && max >= 1 && max >= min) {
      return field({ minGrade: min, maxGrade: max }, "high", raw);
    }
  }

  // Word-form range: "ninth through twelfth grade" / "ninth to twelfth"
  const wordKeys = Object.keys(GRADE_WORD_TO_NUMBER).join("|");
  const wordRange = new RegExp(
    `\\b(${wordKeys})\\b\\s*(?:-|–|—|to|through)\\s*\\b(${wordKeys})\\b`
  ).exec(text);
  if (wordRange) {
    const min = GRADE_WORD_TO_NUMBER[wordRange[1]];
    const max = GRADE_WORD_TO_NUMBER[wordRange[2]];
    if (max >= min) return field({ minGrade: min, maxGrade: max }, "high", raw);
  }

  // Single grade: "grade 10", "10th grade", "10th graders"
  const singleGrade = text.match(/(?:grade\s*)?(\d{1,2})(?:th|st|nd|rd)?\s*(?:grade|grader)?s?\b/);
  if (singleGrade) {
    const grade = Number.parseInt(singleGrade[1], 10);
    if (grade >= 1 && grade <= 12) return field({ minGrade: grade, maxGrade: grade }, "high", raw);
  }

  if (/\ball grades\b|\bany grade\b|\bopen to all students\b/.test(text)) {
    return field({ minGrade: null, maxGrade: null }, "high", raw);
  }

  return field<GradeRange>(null, "low", raw);
}

export type NormalizedCost = { costType: OpportunityCostType; costAmount: number | null };

/** Parses free-cost/paid-cost text. Anything not clearly "free" or a parsable dollar amount is left unknown rather than assumed free or assumed paid. */
export function normalizeCost(raw: string): NormalizedField<NormalizedCost> {
  const text = raw.toLowerCase().trim();
  if (text.length === 0) return field<NormalizedCost>(null, "low", raw);

  if (/\b(free|no cost|no charge|\$0)\b/.test(text)) {
    return field({ costType: "free", costAmount: 0 }, "high", raw);
  }

  // "Unpaid"/"stipend" describe whether the *program* compensates the
  // student, not whether the student is charged — but in practice an
  // internship program that mentions either is not charging the student
  // an application/participation fee either, so both are treated as
  // (medium-confidence) evidence of a free-to-the-student cost_type.
  if (/\b(unpaid|stipend)\b/.test(text)) {
    return { value: { costType: "free", costAmount: 0 }, confidence: "low", raw };
  }

  const amountMatch = text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
  if (amountMatch) {
    const amount = Number.parseFloat(amountMatch[1].replace(/,/g, ""));
    if (Number.isFinite(amount) && amount >= 0) {
      return field({ costType: "paid", costAmount: amount }, "high", raw);
    }
  }

  if (/\bpaid\b|\btuition\b|\bfee\b/.test(text)) {
    return field({ costType: "paid", costAmount: null }, "low", raw);
  }

  return field<NormalizedCost>(null, "low", raw);
}

const MONTH_NAMES =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const MONTH_TO_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function monthIndex(name: string): number {
  const key = name.slice(0, 3).toLowerCase();
  return MONTH_TO_INDEX[key];
}

/**
 * Parses an explicit calendar date out of free text (e.g. "March 15, 2027",
 * "3/15/2027", "2027-03-15") into an ISO date string at UTC midnight.
 * Deliberately does NOT understand "rolling", "TBD", or relative phrases
 * like "in two weeks" — those aren't exact deadlines, and guessing a date
 * for them would violate "never invent a deadline". Returns `null` for
 * anything ambiguous so the deadline evaluator (deadline.ts) can classify it
 * as unknown/rolling instead of a fabricated exact date.
 */
export function normalizeDeadline(raw: string): NormalizedField<string> {
  const text = raw.trim();
  if (text.length === 0) return field<string>(null, "low", raw);

  if (/\b(rolling|no deadline|ongoing|until filled)\b/i.test(text)) {
    return field<string>(null, "high", raw);
  }

  const monthDayYear = new RegExp(
    `\\b(${MONTH_NAMES})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`,
    "i"
  ).exec(text);
  if (monthDayYear) {
    const month = monthIndex(monthDayYear[1]);
    const day = Number.parseInt(monthDayYear[2], 10);
    const year = Number.parseInt(monthDayYear[3], 10);
    const iso = isoDateUtc(year, month, day);
    if (iso) return field<string>(iso, "high", raw);
  }

  const isoLike = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoLike) {
    const iso = isoDateUtc(
      Number.parseInt(isoLike[1], 10),
      Number.parseInt(isoLike[2], 10) - 1,
      Number.parseInt(isoLike[3], 10)
    );
    if (iso) return field(iso, "high", raw);
  }

  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (slash) {
    const iso = isoDateUtc(
      Number.parseInt(slash[3], 10),
      Number.parseInt(slash[1], 10) - 1,
      Number.parseInt(slash[2], 10)
    );
    if (iso) return field(iso, "high", raw);
  }

  return field<string>(null, "low", raw);
}

/** Builds an ISO string for UTC midnight on the given date, returning `null` if the components don't round-trip (e.g. "Feb 30"). */
function isoDateUtc(year: number, monthIndex0: number, day: number): string | null {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthIndex0) ||
    !Number.isInteger(day) ||
    monthIndex0 < 0 ||
    monthIndex0 > 11
  ) {
    return null;
  }
  const date = new Date(Date.UTC(year, monthIndex0, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== monthIndex0 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString();
}

/**
 * Parses a weekly-hours commitment. For a range ("5-10 hours/week"), the
 * upper bound is kept — comparing against a student's availability ceiling
 * (see matching.ts) should err toward flagging a possible mismatch rather
 * than silently understating the real time commitment.
 */
export function normalizeCommitment(raw: string): NormalizedField<number> {
  const text = raw.toLowerCase();
  if (text.trim().length === 0) return field<number>(null, "low", raw);

  const range = text.match(/(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/);
  if (range) {
    const max = Number.parseFloat(range[2]);
    if (Number.isFinite(max) && max > 0) return field(max, "high", raw);
  }

  const single = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/);
  if (single) {
    const hours = Number.parseFloat(single[1]);
    if (Number.isFinite(hours) && hours > 0) return field(hours, "high", raw);
  }

  return field<number>(null, "low", raw);
}

/** Validates and trims a URL. Never rewrites the host/path — only confirms it parses as an absolute URL. */
export function normalizeUrl(raw: string): NormalizedField<string> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return field<string>(null, "low", raw);
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return field<string>(null, "low", raw);
    return field(url.toString(), "high", raw);
  } catch {
    return field<string>(null, "low", raw);
  }
}

/** Case/whitespace-insensitive match against the fixed interest-tag vocabulary (same list as `student_interests.interest`, see the Milestone 4 migration). Unmatched input is dropped, not guessed at. */
export function normalizeInterestTags(
  raw: readonly string[],
  knownTags: readonly string[]
): NormalizedField<string[]> {
  const knownByLower = new Map(knownTags.map((tag) => [tag.toLowerCase(), tag]));
  const matched: string[] = [];
  for (const candidate of raw) {
    const canonical = knownByLower.get(candidate.trim().toLowerCase());
    if (canonical && !matched.includes(canonical)) matched.push(canonical);
  }
  const confidence: "high" | "low" = matched.length === raw.length ? "high" : "low";
  return field(matched, raw.length === 0 ? "low" : confidence, raw.join(", "));
}

export function normalizeLocation(raw: string): NormalizedField<string> {
  const cleaned = collapseWhitespace(raw);
  if (cleaned.length === 0) return field<string>(null, "low", raw);
  return field(cleaned, "high", raw);
}

const RESIDENCY_PATTERN = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+resident(?:s)?\b/;
const US_RESIDENCY_PATTERN = /\bu\.?s\.?\s+resident|\bunited states resident/i;

/** Keyword-based residency detection — flagged low confidence, since free text is inherently ambiguous. The raw text is always preserved for a human to confirm (see review-queue.ts's "residency_citizenship_ambiguity" reason). */
export function normalizeResidencyRequirement(raw: string): NormalizedField<string> {
  if (raw.trim().length === 0) return field<string>(null, "low", raw);
  if (US_RESIDENCY_PATTERN.test(raw)) return field("United States", "low", raw);
  const match = RESIDENCY_PATTERN.exec(raw);
  if (match) return field(match[1], "low", raw);
  return field<string>(null, "low", raw);
}

const CITIZENSHIP_PATTERNS: { pattern: RegExp; value: string }[] = [
  { pattern: /\bmust be a? ?u\.?s\.?\s+citizen\b/i, value: "U.S. citizen" },
  { pattern: /\bu\.?s\.?\s+citizen(ship)? required\b/i, value: "U.S. citizen" },
  { pattern: /\bcitizen(ship)? not required\b|\bopen to (all|international) (students|applicants)\b/i, value: "None" },
  { pattern: /\bpermanent resident(s)? or citizen(s)?\b/i, value: "U.S. citizen or permanent resident" },
];

export function normalizeCitizenshipRequirement(raw: string): NormalizedField<string> {
  if (raw.trim().length === 0) return field<string>(null, "low", raw);
  for (const { pattern, value } of CITIZENSHIP_PATTERNS) {
    if (pattern.test(raw)) return field(value, "low", raw);
  }
  return field<string>(null, "low", raw);
}

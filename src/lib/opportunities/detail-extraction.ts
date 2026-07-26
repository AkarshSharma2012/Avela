import type { ExtractedField, ExtractionMethod } from "@/lib/opportunities/extraction";

/**
 * Deep-detail field extraction (Milestone 7 spec section 3), beyond the
 * core title/organization/deadline/grade/cost fields `extraction.ts` +
 * `normalization.ts` already handle. Same discipline as those modules:
 * every extractor scans only a tight character window around a relevant
 * keyword match (never the whole page — see `ingestion-runner.ts`'s
 * `relevantExcerpt` for why a whole-page scan picks up nav/sidebar false
 * positives), and returns `value: null` rather than a guess when nothing
 * matches. `expected_outcomes` and `program_benefits` are deliberately
 * NOT implemented here — free-form prose summaries have no reliable
 * deterministic marker, and guessing one would fabricate a signal exactly
 * like `extraction.ts`'s `llmAssistedExtractor` placeholder already
 * refuses to. Both remain valid keys on `OpportunityExtendedDetails`,
 * simply never populated until a real LLM-assisted pass exists.
 */

function field<T>(value: T | null, confidence: number, evidence: string, method: ExtractionMethod): ExtractedField<T> {
  return { value, confidence, evidence, method };
}

const METHOD: ExtractionMethod = "html_metadata";

/**
 * Joins tight windows around every match of `pattern` — same shape as
 * ingestion-runner.ts's relevantExcerpt, duplicated here (not imported)
 * to keep this module dependency-free and independently unit-testable.
 * Always forces the `g` flag on the constructed regex regardless of
 * `pattern`'s own flags: without it, `regex.exec()` never advances past
 * the first match on a non-global regex, so the `while` loop below would
 * spin forever the instant `pattern` actually matched anything.
 */
function scopedExcerpt(text: string, pattern: RegExp, windowChars: number): string {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);
  const windows: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const start = Math.max(0, match.index - windowChars);
    const end = Math.min(text.length, match.index + match[0].length + windowChars);
    windows.push(text.slice(start, end));
    if (match[0].length === 0) regex.lastIndex++;
  }
  return windows.join(" | ");
}

function booleanPresence(text: string, pattern: RegExp, windowChars = 40): ExtractedField<boolean> {
  const excerpt = scopedExcerpt(text, pattern, windowChars);
  if (excerpt.length === 0) return field<boolean>(null, 0, "", METHOD);
  return field(true, 80, excerpt, METHOD);
}

// --- Age range --------------------------------------------------------------

const AGE_RANGE_PATTERN = /\bages?\s*(\d{1,2})\s*(?:-|–|—|to|through)\s*(\d{1,2})\b/gi;
const AGE_MIN_ONLY_PATTERN = /\b(?:age|ages)\s*(\d{1,2})\s*(?:or older|and older|\+)\b/gi;

export type AgeRange = { minAge: number | null; maxAge: number | null };

export function extractAgeRange(text: string): ExtractedField<AgeRange> {
  const rangeMatch = AGE_RANGE_PATTERN.exec(text);
  AGE_RANGE_PATTERN.lastIndex = 0;
  if (rangeMatch) {
    const min = Number.parseInt(rangeMatch[1], 10);
    const max = Number.parseInt(rangeMatch[2], 10);
    if (max >= min) {
      return field({ minAge: min, maxAge: max }, 85, rangeMatch[0], METHOD);
    }
  }
  const minOnlyMatch = AGE_MIN_ONLY_PATTERN.exec(text);
  AGE_MIN_ONLY_PATTERN.lastIndex = 0;
  if (minOnlyMatch) {
    return field({ minAge: Number.parseInt(minOnlyMatch[1], 10), maxAge: null }, 75, minOnlyMatch[0], METHOD);
  }
  return field<AgeRange>(null, 0, "", METHOD);
}

// --- School enrollment requirement ------------------------------------------

const SCHOOL_ENROLLMENT_PATTERN = /\b(currently enrolled|must be enrolled|enrolled in (a |an )?(high school|middle school|school))\b/i;

export function extractSchoolEnrollmentRequired(text: string): ExtractedField<boolean> {
  return booleanPresence(text, SCHOOL_ENROLLMENT_PATTERN, 50);
}

// --- Application-requirement booleans ---------------------------------------

const ESSAY_PATTERN = /\b(essay required|personal statement|short essay|written statement)\b/i;
const RECOMMENDATION_PATTERN = /\b(letter[s]? of recommendation|recommendation letter|reference letter)\b/i;
const TRANSCRIPT_PATTERN = /\b(official transcript|school transcript|transcript required)\b/i;
const INTERVIEW_PATTERN = /\b(interview required|will be interviewed|selected .{0,20} interview|virtual interview)\b/i;
const PARENT_CONSENT_PATTERN = /\b(parent(al)? consent|parent or guardian must sign|guardian consent|signed by a parent)\b/i;

export function extractEssayRequired(text: string): ExtractedField<boolean> {
  return booleanPresence(text, ESSAY_PATTERN, 50);
}
export function extractRecommendationRequired(text: string): ExtractedField<boolean> {
  return booleanPresence(text, RECOMMENDATION_PATTERN, 50);
}
export function extractTranscriptRequired(text: string): ExtractedField<boolean> {
  return booleanPresence(text, TRANSCRIPT_PATTERN, 50);
}
export function extractInterviewRequired(text: string): ExtractedField<boolean> {
  return booleanPresence(text, INTERVIEW_PATTERN, 50);
}
export function extractParentConsentRequired(text: string): ExtractedField<boolean> {
  return booleanPresence(text, PARENT_CONSENT_PATTERN, 50);
}

// --- Application contact ----------------------------------------------------

const EMAIL_PATTERN = /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i;

export function extractApplicationContact(text: string): ExtractedField<string> {
  const match = EMAIL_PATTERN.exec(text);
  if (!match) return field<string>(null, 0, "", METHOD);
  return field(match[0], 80, match[0], METHOD);
}

// --- Pay / stipend amounts ---------------------------------------------------

const HOURLY_PAY_PATTERN = /\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:\/|\s*per\s*)\s*hour|\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:an|\/)?\s*hr\b/i;
const STIPEND_AMOUNT_PATTERN = /\bstipend[^.$]{0,30}\$\s*([\d,]+(?:\.\d{1,2})?)/i;

export function extractHourlyPay(text: string): ExtractedField<number> {
  const match = HOURLY_PAY_PATTERN.exec(text);
  if (!match) return field<number>(null, 0, "", METHOD);
  const raw = match[1] ?? match[2];
  const amount = Number.parseFloat(raw.replace(/,/g, ""));
  if (!Number.isFinite(amount)) return field<number>(null, 0, "", METHOD);
  return field(amount, 80, match[0], METHOD);
}

export function extractStipendAmount(text: string): ExtractedField<number> {
  const match = STIPEND_AMOUNT_PATTERN.exec(text);
  if (!match) return field<number>(null, 0, "", METHOD);
  const amount = Number.parseFloat(match[1].replace(/,/g, ""));
  if (!Number.isFinite(amount)) return field<number>(null, 0, "", METHOD);
  return field(amount, 75, match[0], METHOD);
}

// --- Financial aid / transportation / housing --------------------------------

const FINANCIAL_AID_PATTERN = /\b(financial aid|need-based aid|fee waiver|scholarship(s)? available|cost is not a barrier)\b/i;
const TRANSPORTATION_PATTERN = /\b(transportation (stipend|provided|is provided)|travel stipend|travel expenses (covered|reimbursed))\b/i;
const HOUSING_PATTERN = /\b(housing (provided|is provided)|on-campus housing|dormitory|room and board)\b/i;

export function extractFinancialAidAvailable(text: string): ExtractedField<boolean> {
  return booleanPresence(text, FINANCIAL_AID_PATTERN, 50);
}
export function extractTransportationSupport(text: string): ExtractedField<boolean> {
  return booleanPresence(text, TRANSPORTATION_PATTERN, 50);
}
export function extractHousingSupport(text: string): ExtractedField<boolean> {
  return booleanPresence(text, HOUSING_PATTERN, 50);
}

// --- Notification date -------------------------------------------------------

const NOTIFICATION_CONTEXT_PATTERN = /\b(notified|notification|decisions? will be (sent|released|made)|you will hear back)\b/gi;

const MONTH_NAMES =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const MONTH_TO_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function isoDateUtc(year: number, monthIndex0: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex0) || !Number.isInteger(day)) return null;
  const date = new Date(Date.UTC(year, monthIndex0, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== monthIndex0 || date.getUTCDate() !== day) {
    return null;
  }
  return date.toISOString();
}

export function extractNotificationDate(text: string): ExtractedField<string> {
  const excerpt = scopedExcerpt(text, NOTIFICATION_CONTEXT_PATTERN, 40);
  if (excerpt.length === 0) return field<string>(null, 0, "", METHOD);

  const monthDayYear = new RegExp(`\\b(${MONTH_NAMES})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "i").exec(
    excerpt
  );
  if (monthDayYear) {
    const month = MONTH_TO_INDEX[monthDayYear[1].slice(0, 3).toLowerCase()];
    const day = Number.parseInt(monthDayYear[2], 10);
    const year = Number.parseInt(monthDayYear[3], 10);
    const iso = isoDateUtc(year, month, day);
    if (iso) return field(iso, 75, excerpt, METHOD);
  }
  return field<string>(null, 0, excerpt, METHOD);
}

// --- Schedule / attendance ----------------------------------------------------

const SCHEDULE_PATTERN = /\b(monday through friday|weekdays|meets weekly|full-time schedule|part-time schedule)\b/i;
const ATTENDANCE_PATTERN = /\b(in-person attendance required|must attend all sessions|mandatory attendance|attendance is required)\b/i;

export function extractScheduleText(text: string): ExtractedField<string> {
  const match = SCHEDULE_PATTERN.exec(text);
  if (!match) return field<string>(null, 0, "", METHOD);
  return field(match[0], 65, match[0], METHOD);
}

export function extractAttendanceRequirements(text: string): ExtractedField<string> {
  const match = ATTENDANCE_PATTERN.exec(text);
  if (!match) return field<string>(null, 0, "", METHOD);
  return field(match[0], 65, match[0], METHOD);
}

// --- Certificate / academic credit -------------------------------------------

const CERTIFICATE_PATTERN = /\b(certificate of completion|academic credit|college credit|earn credit)\b/i;

export function extractCertificateOrCredit(text: string): ExtractedField<string> {
  const match = CERTIFICATE_PATTERN.exec(text);
  if (!match) return field<string>(null, 0, "", METHOD);
  return field(match[0], 70, match[0], METHOD);
}

// --- Required documents ------------------------------------------------------

const DOCUMENT_KEYWORDS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bofficial transcript\b/i, label: "Official transcript" },
  { pattern: /\bresum[ée]\b/i, label: "Resume" },
  { pattern: /\bletter[s]? of recommendation\b/i, label: "Letter of recommendation" },
  { pattern: /\b(personal statement|essay)\b/i, label: "Personal statement/essay" },
  { pattern: /\bportfolio\b/i, label: "Portfolio" },
];

export function extractRequiredDocuments(text: string): ExtractedField<string[]> {
  const found = DOCUMENT_KEYWORDS.filter(({ pattern }) => pattern.test(text)).map(({ label }) => label);
  if (found.length === 0) return field<string[]>(null, 0, "", METHOD);
  return field(found, 75, found.join(", "), METHOD);
}

// --- Skills (small, deliberately conservative vocabulary) --------------------

const SKILL_KEYWORDS = [
  "public speaking",
  "coding",
  "programming",
  "writing",
  "research",
  "data analysis",
  "leadership",
  "teamwork",
  "public policy",
  "laboratory",
  "design",
];

export function extractSkills(text: string): ExtractedField<string[]> {
  const lower = text.toLowerCase();
  const found = SKILL_KEYWORDS.filter((skill) => lower.includes(skill));
  if (found.length === 0) return field<string[]>(null, 0, "", METHOD);
  return field(found, 60, found.join(", "), METHOD);
}

// --- Driver: runs every extractor and reports which fields carried real evidence ---

export type DetailFieldName =
  | "age_range"
  | "school_enrollment_required"
  | "essay_required"
  | "recommendation_required"
  | "transcript_required"
  | "interview_required"
  | "parent_consent_required"
  | "application_contact"
  | "hourly_pay"
  | "stipend_amount"
  | "financial_aid_available"
  | "transportation_support"
  | "housing_support"
  | "notification_date"
  | "schedule_text"
  | "attendance_requirements"
  | "certificate_or_credit"
  | "required_documents"
  | "skills";

export type DetailExtractionResult = Partial<Record<DetailFieldName, ExtractedField<unknown>>>;

/** Runs every deep-detail extractor against the same stripped page text `extraction.ts`'s core extractors use, keeping only fields that actually found something (a field with `value: null` is simply omitted, never stored as a fabricated "no"). */
export function extractDetailFields(text: string): DetailExtractionResult {
  const candidates: [DetailFieldName, ExtractedField<unknown>][] = [
    ["age_range", extractAgeRange(text)],
    ["school_enrollment_required", extractSchoolEnrollmentRequired(text)],
    ["essay_required", extractEssayRequired(text)],
    ["recommendation_required", extractRecommendationRequired(text)],
    ["transcript_required", extractTranscriptRequired(text)],
    ["interview_required", extractInterviewRequired(text)],
    ["parent_consent_required", extractParentConsentRequired(text)],
    ["application_contact", extractApplicationContact(text)],
    ["hourly_pay", extractHourlyPay(text)],
    ["stipend_amount", extractStipendAmount(text)],
    ["financial_aid_available", extractFinancialAidAvailable(text)],
    ["transportation_support", extractTransportationSupport(text)],
    ["housing_support", extractHousingSupport(text)],
    ["notification_date", extractNotificationDate(text)],
    ["schedule_text", extractScheduleText(text)],
    ["attendance_requirements", extractAttendanceRequirements(text)],
    ["certificate_or_credit", extractCertificateOrCredit(text)],
    ["required_documents", extractRequiredDocuments(text)],
    ["skills", extractSkills(text)],
  ];

  const result: DetailExtractionResult = {};
  for (const [name, extracted] of candidates) {
    if (extracted.value !== null) result[name] = extracted;
  }
  return result;
}

import { normalizeDeadline } from "@/lib/opportunities/normalization";
import type { OpportunityApplicationStatus } from "@/types/database";

/**
 * Phrase-based application-status detection (Milestone 7 spec section 6) —
 * a refinement layered on top of, not a replacement for,
 * `ingestion-runner.ts`'s existing deadline-status-derived fallback.
 * Operates on plain page text only (never HTML/links), so a program page
 * that merely contains an "Apply" link can never register as "open" here —
 * only an explicit status phrase can. Every match is scoped to a tight
 * window around the triggering phrase (same discipline as
 * `detail-extraction.ts`/`ingestion-runner.ts`'s `relevantExcerpt`), never
 * the whole page.
 */

function scopedExcerpt(text: string, pattern: RegExp, windowChars: number): string {
  const regex = new RegExp(pattern.source, pattern.flags);
  const match = regex.exec(text);
  if (!match) return "";
  const start = Math.max(0, match.index - windowChars);
  const end = Math.min(text.length, match.index + match[0].length + windowChars);
  return text.slice(start, end);
}

const CLOSED_PATTERN =
  /\b(no longer accepting applications|applications? (?:are|is) currently closed|applications? (?:are|is) closed|not currently accepting applications)\b/i;
const EXTENDED_PATTERN = /\b(deadline has been extended|deadline extended|extended (?:the|its) deadline)\b/i;
const ROLLING_PATTERN = /\b(rolling admissions?|rolling basis|accepted on a rolling basis)\b/i;
const OPEN_PATTERN =
  /\b(applications? (?:are|is) (?:now |currently )?open|apply now|currently accepting applications|now accepting applications)\b/i;
const NEXT_CYCLE_PATTERN =
  /\b(next (?:application )?cycle opens|check back (?:in|soon)|applications? for (?:the )?next (?:cycle|year|session))\b/i;
const OPENS_AT_PATTERN = /\bapplications? (?:will )?opens? (?:on |in )?/i;
const CLOSES_AT_PATTERN = /\b(applications? closes? on|applications? due|deadline (?:is|to apply))\b/i;

export type ApplicationStatusResult = {
  status: OpportunityApplicationStatus;
  isRolling: boolean;
  isNextCycleAnnounced: boolean;
  opensAt: string | null;
  closesAt: string | null;
  /** Real excerpt the determination was based on — empty only when `status` is `unknown` because no phrase matched. */
  evidence: string;
  /** 0-100 — how strong the phrase signal was, not the same as extraction.ts's field confidence but the same 0-100 scale. */
  confidence: number;
};

const UNKNOWN_RESULT: ApplicationStatusResult = {
  status: "unknown",
  isRolling: false,
  isNextCycleAnnounced: false,
  opensAt: null,
  closesAt: null,
  evidence: "",
  confidence: 0,
};

/**
 * Detects application status from explicit official phrasing. Checked in
 * priority order: an explicit "closed" phrase always wins (a page can say
 * both "Apply now" in a sidebar CTA and "applications closed" in its body
 * — the specific closed statement is the more authoritative one); then
 * rolling admissions; then an explicit open/extended statement; then a
 * next-cycle-announced or opens-at signal; finally, a lone "closes on"
 * date with no accompanying open/closed phrase is reported as `unknown`
 * status but still returns the parsed `closesAt` for the caller to
 * combine with `deadline.ts`'s evaluation.
 */
export function detectApplicationStatus(text: string, now: Date = new Date()): ApplicationStatusResult {
  void now;

  const closedExcerpt = scopedExcerpt(text, CLOSED_PATTERN, 40);
  if (closedExcerpt) {
    return { ...UNKNOWN_RESULT, status: "closed", evidence: closedExcerpt, confidence: 85 };
  }

  const rollingExcerpt = scopedExcerpt(text, ROLLING_PATTERN, 40);
  if (rollingExcerpt) {
    return {
      ...UNKNOWN_RESULT,
      status: "accepting_applications",
      isRolling: true,
      evidence: rollingExcerpt,
      confidence: 85,
    };
  }

  const closesExcerpt = scopedExcerpt(text, CLOSES_AT_PATTERN, 35);
  const closesDate = closesExcerpt ? normalizeDeadline(closesExcerpt).value : null;

  const extendedExcerpt = scopedExcerpt(text, EXTENDED_PATTERN, 40);
  const openExcerpt = scopedExcerpt(text, OPEN_PATTERN, 40);
  if (extendedExcerpt || openExcerpt) {
    return {
      ...UNKNOWN_RESULT,
      status: "accepting_applications",
      closesAt: closesDate,
      evidence: extendedExcerpt || openExcerpt,
      confidence: 80,
    };
  }

  const nextCycleExcerpt = scopedExcerpt(text, NEXT_CYCLE_PATTERN, 40);
  const opensExcerpt = scopedExcerpt(text, OPENS_AT_PATTERN, 35);
  if (nextCycleExcerpt || opensExcerpt) {
    const opensDate = opensExcerpt ? normalizeDeadline(opensExcerpt).value : null;
    return {
      ...UNKNOWN_RESULT,
      status: "opening_soon",
      isNextCycleAnnounced: Boolean(nextCycleExcerpt),
      opensAt: opensDate,
      evidence: nextCycleExcerpt || opensExcerpt,
      confidence: 70,
    };
  }

  if (closesExcerpt) {
    return { ...UNKNOWN_RESULT, closesAt: closesDate, evidence: closesExcerpt, confidence: 30 };
  }

  return UNKNOWN_RESULT;
}

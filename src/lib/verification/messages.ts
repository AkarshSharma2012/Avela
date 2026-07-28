/**
 * The single source of truth for every student-facing verification-check
 * message. Centralizing these (rather than inlining strings at each call
 * site in evidence-checks.ts) makes the "never say X" rule mechanically
 * checkable in one place — see tests/verification/messages.test.ts, which
 * scans every string here for the forbidden words below.
 *
 * These checks are consistency checks only, never a truth judgment: the
 * system can say evidence doesn't clearly match, is incomplete, or has
 * expired — never that a claim is false, that a student is lying, or that
 * a document is forged.
 */

export type EvidenceFindingCode =
  | "no_evidence"
  | "file_type_not_allowed"
  | "file_unreadable"
  | "filename_unsafe"
  | "date_mismatch"
  | "organization_mismatch"
  | "category_mismatch"
  | "url_not_https"
  | "url_not_official"
  | "evidence_expired"
  | "duplicate_evidence_reused";

export const FORBIDDEN_WORDS: readonly string[] = ["fake", "fraud", "liar", "lying", "false claim", "forged", "forgery"];

export const EVIDENCE_FINDING_MESSAGES: Record<EvidenceFindingCode, string> = {
  no_evidence: "More information is needed to support this entry.",
  file_type_not_allowed: "That file type isn't supported yet — try a PDF, Word document, PNG, or JPG.",
  file_unreadable: "This file couldn't be opened. Try uploading it again.",
  filename_unsafe: "That file name isn't supported — try renaming it and uploading again.",
  date_mismatch: "The dates on this evidence don't clearly line up with the dates on this entry.",
  organization_mismatch: "The organization name differs from the portfolio entry.",
  category_mismatch: "The evidence does not clearly match this entry.",
  url_not_https: "This link needs to use a secure (https://) address.",
  url_not_official: "This doesn't look like an official page for this organization — it can still be added as evidence.",
  evidence_expired: "This document appears expired.",
  duplicate_evidence_reused: "This same evidence is already used on a different entry — double check it belongs here too.",
};

export function buildEvidenceFindingMessage(code: EvidenceFindingCode): string {
  return EVIDENCE_FINDING_MESSAGES[code];
}

/** Used by tests (and safe to call from any reviewer-notes save path) to keep the "never say X" rule enforced in code, not just in a message bank someone could quietly add to later. */
export function containsForbiddenLanguage(text: string): boolean {
  const lower = text.toLowerCase();
  return FORBIDDEN_WORDS.some((word) => lower.includes(word));
}

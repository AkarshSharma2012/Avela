/**
 * Deterministic comparison logic (spec section 6) — pure functions, no
 * network access, no LLM calls. Normalization and fuzzy matching are only
 * ever supporting signals: nothing here decides a support level on its
 * own, it only feeds scoring.ts and the manual-review gate below.
 */

import { DATE_OVERLAP_TOLERANCE_DAYS, NAME_SIMILARITY_STRONG_THRESHOLD, ORGANIZATION_SIMILARITY_STRONG_THRESHOLD, TITLE_SIMILARITY_STRONG_THRESHOLD } from "@/lib/osint/constants";
import type { ManualReviewReason, MatchAssessment } from "@/lib/osint/types";

const STOPWORDS = new Set(["the", "a", "an", "of", "and", "for", "at", "in", "on", "to"]);

export function normalizeText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string | null | undefined): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

/** Sorensen-Dice coefficient over the token sets — 0 (no overlap) to 1 (identical token sets). Robust to word order and minor phrasing differences, unlike a raw substring check. */
export function textSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const tokensA = new Set(tokens(a));
  const tokensB = new Set(tokens(b));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap++;
  }
  return (2 * overlap) / (tokensA.size + tokensB.size);
}

export function titleSimilarity(claimedTitle: string, observedTitle: string): number {
  return textSimilarity(claimedTitle, observedTitle);
}

export function organizationSimilarity(claimedOrg: string | null, observedOrg: string | null): number | null {
  if (!claimedOrg || !observedOrg) return null;
  return textSimilarity(claimedOrg, observedOrg);
}

/**
 * Name matching is intentionally the same token-Dice logic as title/org —
 * a matching name is only ever a supporting signal (spec section 5: "a
 * matching name alone never verifies a claim"), never elevated to its own
 * stricter algorithm that a caller might mistake for identity verification.
 */
export function studentNameSimilarity(claimedName: string, observedName: string | null): number | null {
  if (!observedName) return null;
  return textSimilarity(claimedName, observedName);
}

/** A name too short or generic to reliably disambiguate one person from another — triggers manual review (spec section 6) rather than ever being treated as a confirmed identity match. */
export function isAmbiguousName(name: string): boolean {
  const parts = tokens(name);
  if (parts.length < 2) return true;
  if (parts.every((part) => part.length <= 2)) return true;
  return false;
}

function parseDate(value: string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * 1 = ranges fully overlap (within tolerance), 0 = no overlap at all, null
 * = not enough date information on one side to compare. A single claimed
 * date compared against an observed range counts as overlapping if it
 * falls within the range (plus tolerance).
 */
export function dateOverlap(
  claimedStart: string | null,
  claimedEnd: string | null,
  observedStart: string | null,
  observedEnd: string | null,
  toleranceDays: number = DATE_OVERLAP_TOLERANCE_DAYS
): number | null {
  const cs = parseDate(claimedStart);
  const ce = parseDate(claimedEnd) ?? cs;
  const os = parseDate(observedStart);
  const oe = parseDate(observedEnd) ?? os;
  if (cs === null || os === null) return null;

  const toleranceMs = toleranceDays * 24 * 60 * 60 * 1000;
  const claimedRange: [number, number] = [cs, ce ?? cs];
  const observedRange: [number, number] = [os, oe ?? os];

  const overlapStart = Math.max(claimedRange[0], observedRange[0]) - toleranceMs;
  const overlapEnd = Math.min(claimedRange[1], observedRange[1]) + toleranceMs;
  if (overlapEnd < overlapStart) return 0;
  return 1;
}

export function roleMatch(claimedRole: string | null, observedRole: string | null): boolean | null {
  if (!claimedRole || !observedRole) return null;
  return textSimilarity(claimedRole, observedRole) >= 0.4;
}

export function credentialIdMatch(claimedId: string | null, observedId: string | null): boolean | null {
  if (!claimedId || !observedId) return null;
  return normalizeText(claimedId).replace(/\s/g, "") === normalizeText(observedId).replace(/\s/g, "");
}

const CREDENTIAL_ID_PATTERN = /\b(?:certificate|credential|license|award)?\s*(?:id|no|number|#)[\s#:.]*([a-z0-9-]{4,})/i;

/** Opportunistically pulls a credential/certificate ID out of free text the student wrote (e.g. a portfolio item's description) — a supporting signal only, never required. */
export function extractCredentialId(text: string | null): string | null {
  if (!text) return null;
  const match = CREDENTIAL_ID_PATTERN.exec(text);
  return match ? match[1]!.toUpperCase() : null;
}

/** Repository ownership/contribution match: the claimant's github handle (parsed from a github.com URL elsewhere) either owns the repo or appears as a contributor/committer login. */
export function repositoryOwnershipMatch(claimantGithubLogin: string | null, repoOwnerLogin: string, contributorLogins: string[]): boolean {
  if (!claimantGithubLogin) return false;
  const normalized = claimantGithubLogin.toLowerCase();
  if (repoOwnerLogin.toLowerCase() === normalized) return true;
  return contributorLogins.some((login) => login.toLowerCase() === normalized);
}

/** Crossref authors are given/family name pairs — compared against the student's display name with the same Dice-similarity signal as everything else. */
export function publicationAuthorMatch(studentDisplayName: string, authors: { given?: string; family?: string }[]): boolean {
  return authors.some((author) => {
    const fullName = [author.given, author.family].filter(Boolean).join(" ");
    return textSimilarity(studentDisplayName, fullName) >= NAME_SIMILARITY_STRONG_THRESHOLD;
  });
}

export function awardProgramMatch(claimedTitle: string, claimedOrg: string | null, observedTitle: string, observedOrg: string | null): boolean {
  const titleScore = titleSimilarity(claimedTitle, observedTitle);
  const orgScore = organizationSimilarity(claimedOrg, observedOrg);
  if (orgScore === null) return titleScore >= TITLE_SIMILARITY_STRONG_THRESHOLD;
  return titleScore >= TITLE_SIMILARITY_STRONG_THRESHOLD && orgScore >= ORGANIZATION_SIMILARITY_STRONG_THRESHOLD;
}

export type ManualReviewInput = {
  claimedStudentName: string;
  claimedOrganization: string | null;
  observedOrganization: string | null;
  dateOverlapScore: number | null;
  sourceIsOfficial: boolean;
  sourceMentionsEvent: boolean;
  sourceMentionsStudent: boolean;
  repositoryOwnershipUnclear: boolean;
  possibleIdentityConfusion: boolean;
};

/** Spec section 6's "Require manual review when" list, evaluated together so every caller applies the same rules. */
export function assessManualReview(input: ManualReviewInput): ManualReviewReason[] {
  const reasons: ManualReviewReason[] = [];
  if (isAmbiguousName(input.claimedStudentName)) reasons.push("ambiguous_student_name");
  if (input.dateOverlapScore === 0) reasons.push("material_date_conflict");
  if (input.claimedOrganization && input.observedOrganization && organizationSimilarity(input.claimedOrganization, input.observedOrganization)! < ORGANIZATION_SIMILARITY_STRONG_THRESHOLD) {
    reasons.push("organization_conflict");
  }
  if (input.repositoryOwnershipUnclear) reasons.push("unclear_repository_ownership");
  if (input.sourceMentionsEvent && !input.sourceMentionsStudent) reasons.push("source_silent_on_student");
  if (!input.sourceIsOfficial) reasons.push("unofficial_source_only");
  if (input.possibleIdentityConfusion) reasons.push("possible_identity_confusion");
  return reasons;
}

export function buildMatchAssessment(params: {
  claimedTitle: string;
  observedTitle: string;
  claimedOrganization: string | null;
  observedOrganization: string | null;
  claimedStudentName: string;
  observedName: string | null;
  claimedStart: string | null;
  claimedEnd: string | null;
  observedStart: string | null;
  observedEnd: string | null;
  claimedRole: string | null;
  observedRole: string | null;
  claimedCredentialId: string | null;
  observedCredentialId: string | null;
  extraManualReviewReasons?: ManualReviewReason[];
}): MatchAssessment {
  const dateOverlapScore = dateOverlap(params.claimedStart, params.claimedEnd, params.observedStart, params.observedEnd);
  const orgSimilarity = organizationSimilarity(params.claimedOrganization, params.observedOrganization);

  const manualReviewReasons = new Set<ManualReviewReason>(params.extraManualReviewReasons ?? []);
  if (isAmbiguousName(params.claimedStudentName)) manualReviewReasons.add("ambiguous_student_name");
  if (dateOverlapScore === 0) manualReviewReasons.add("material_date_conflict");
  if (orgSimilarity !== null && orgSimilarity < ORGANIZATION_SIMILARITY_STRONG_THRESHOLD) manualReviewReasons.add("organization_conflict");

  return {
    titleSimilarity: titleSimilarity(params.claimedTitle, params.observedTitle),
    organizationSimilarity: orgSimilarity,
    nameSimilarity: studentNameSimilarity(params.claimedStudentName, params.observedName),
    dateOverlap: dateOverlapScore,
    roleMatch: roleMatch(params.claimedRole, params.observedRole),
    credentialIdMatch: credentialIdMatch(params.claimedCredentialId, params.observedCredentialId),
    manualReviewReasons: [...manualReviewReasons],
  };
}

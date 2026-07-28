/**
 * Pure evidence-quality/consistency checks (spec section 2) — no Supabase
 * import, no network access, unit-testable without mocking anything. Every
 * check here only ever compares fields that were actually provided; a
 * missing/unknown field is never treated as a mismatch. These are
 * consistency checks only — they can flag that evidence doesn't clearly
 * match an entry, never that a claim is false (see messages.ts).
 */

import { ALLOWED_PORTFOLIO_MIME_TYPES } from "@/lib/portfolio/constants";
import { buildEvidenceFindingMessage, type EvidenceFindingCode } from "@/lib/verification/messages";
import type { PortfolioItemType } from "@/types/database";

export type EvidenceFinding = {
  code: EvidenceFindingCode;
  message: string;
  /** "blocking" pushes the recommended level to needs_review; "warning" is shown but doesn't by itself. */
  severity: "blocking" | "warning";
};

function finding(code: EvidenceFindingCode, severity: EvidenceFinding["severity"]): EvidenceFinding {
  return { code, message: buildEvidenceFindingMessage(code), severity };
}

// --- Individual checks -------------------------------------------------------

export function checkEvidenceExists(hasEvidence: boolean): EvidenceFinding | null {
  return hasEvidence ? null : finding("no_evidence", "blocking");
}

export function checkFileTypeAllowed(mimeType: string | null): EvidenceFinding | null {
  if (mimeType === null) return null;
  const allowed = (ALLOWED_PORTFOLIO_MIME_TYPES as readonly string[]).includes(mimeType);
  return allowed ? null : finding("file_type_not_allowed", "blocking");
}

export function checkFileReadable(readable: boolean): EvidenceFinding | null {
  return readable ? null : finding("file_unreadable", "blocking");
}

/** Rejects path traversal, control characters, null bytes, and unreasonable lengths — a pure name-shape check, never a content scan. */
export function checkFilenameSafe(filename: string | null): EvidenceFinding | null {
  if (filename === null) return null;
  if (filename.length === 0 || filename.length > 255) return finding("filename_unsafe", "blocking");
  if (/[\x00-\x1f\x7f]/.test(filename)) return finding("filename_unsafe", "blocking");
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) return finding("filename_unsafe", "blocking");
  return null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** How far outside the portfolio item's own date range an evidence date can fall before it's flagged — generous, since a certificate is often issued weeks after a program ends. */
const DATE_TOLERANCE_DAYS = 45;

export function checkDatesConsistent(
  portfolioStartDate: string | null,
  portfolioEndDate: string | null,
  evidenceDate: string | null
): EvidenceFinding | null {
  if (evidenceDate === null) return null;
  const evidenceTime = new Date(evidenceDate).getTime();
  if (Number.isNaN(evidenceTime)) return null;

  const toleranceMs = DATE_TOLERANCE_DAYS * DAY_MS;
  if (portfolioStartDate !== null) {
    const startTime = new Date(portfolioStartDate).getTime();
    if (!Number.isNaN(startTime) && evidenceTime < startTime - toleranceMs) return finding("date_mismatch", "blocking");
  }
  if (portfolioEndDate !== null) {
    const endTime = new Date(portfolioEndDate).getTime();
    if (!Number.isNaN(endTime) && evidenceTime > endTime + toleranceMs) return finding("date_mismatch", "blocking");
  }
  return null;
}

function normalizeOrgName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,'"()]/g, "")
    .replace(/\b(inc|llc|club|of|the|foundation)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A deliberately loose fuzzy match (token containment) — "reasonably consistent," not exact-string-equal, since students and evidence documents phrase organization names differently ("ABC High School" vs "ABC HS"). */
export function checkOrganizationConsistent(portfolioOrganization: string | null, evidenceOrganization: string | null): EvidenceFinding | null {
  if (portfolioOrganization === null || evidenceOrganization === null) return null;
  const a = normalizeOrgName(portfolioOrganization);
  const b = normalizeOrgName(evidenceOrganization);
  if (a.length === 0 || b.length === 0) return null;
  if (a === b || a.includes(b) || b.includes(a)) return null;

  const aTokens = new Set(a.split(" ").filter(Boolean));
  const bTokens = new Set(b.split(" ").filter(Boolean));
  const overlap = [...aTokens].filter((token) => bTokens.has(token)).length;
  const smaller = Math.min(aTokens.size, bTokens.size);
  if (smaller > 0 && overlap / smaller >= 0.5) return null;

  return finding("organization_mismatch", "blocking");
}

export function checkCategoryMatch(itemType: PortfolioItemType, evidenceCategory: PortfolioItemType | null): EvidenceFinding | null {
  if (evidenceCategory === null) return null;
  return evidenceCategory === itemType ? null : finding("category_mismatch", "blocking");
}

export function checkUrlHttps(url: string | null): EvidenceFinding | null {
  if (url === null) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return finding("url_not_https", "blocking");
  }
  return parsed.protocol === "https:" ? null : finding("url_not_https", "blocking");
}

export function checkEvidenceExpired(evidenceExpiresAt: string | null, now: Date = new Date()): EvidenceFinding | null {
  if (evidenceExpiresAt === null) return null;
  const expiresTime = new Date(evidenceExpiresAt).getTime();
  if (Number.isNaN(expiresTime)) return null;
  return expiresTime < now.getTime() ? finding("evidence_expired", "blocking") : null;
}

export function checkDuplicateEvidenceReuse(isReusedOnUnrelatedItem: boolean): EvidenceFinding | null {
  return isReusedOnUnrelatedItem ? finding("duplicate_evidence_reused", "warning") : null;
}

// --- Aggregator --------------------------------------------------------------

export type EvidenceCheckInput = {
  hasEvidence: boolean;
  fileMimeType?: string | null;
  fileReadable?: boolean;
  originalFilename?: string | null;
  evidenceUrl?: string | null;
  itemType: PortfolioItemType;
  evidenceCategory?: PortfolioItemType | null;
  portfolioOrganization?: string | null;
  evidenceOrganization?: string | null;
  portfolioStartDate?: string | null;
  portfolioEndDate?: string | null;
  evidenceDate?: string | null;
  evidenceExpiresAt?: string | null;
  isReusedOnUnrelatedItem?: boolean;
  now?: Date;
};

export type EvidenceCheckResult = {
  findings: EvidenceFinding[];
  /** "evidence_added" if nothing blocking was found (warnings are still shown, but don't force a review); "needs_review" the moment any blocking finding fires. */
  recommendedLevel: "evidence_added" | "needs_review";
};

export function runEvidenceChecks(input: EvidenceCheckInput): EvidenceCheckResult {
  const findings = [
    checkEvidenceExists(input.hasEvidence),
    checkFileTypeAllowed(input.fileMimeType ?? null),
    checkFileReadable(input.fileReadable ?? true),
    checkFilenameSafe(input.originalFilename ?? null),
    checkUrlHttps(input.evidenceUrl ?? null),
    checkDatesConsistent(input.portfolioStartDate ?? null, input.portfolioEndDate ?? null, input.evidenceDate ?? null),
    checkOrganizationConsistent(input.portfolioOrganization ?? null, input.evidenceOrganization ?? null),
    checkCategoryMatch(input.itemType, input.evidenceCategory ?? null),
    checkEvidenceExpired(input.evidenceExpiresAt ?? null, input.now ?? new Date()),
    checkDuplicateEvidenceReuse(input.isReusedOnUnrelatedItem ?? false),
  ].filter((value): value is EvidenceFinding => value !== null);

  const recommendedLevel = findings.some((f) => f.severity === "blocking") ? "needs_review" : "evidence_added";
  return { findings, recommendedLevel };
}

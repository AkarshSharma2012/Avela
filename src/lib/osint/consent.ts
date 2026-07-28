/**
 * Consent scope (spec section 3) — exactly what a student agreed to before
 * a check ever runs. Built once, frozen onto the check row, and never
 * expanded after the fact: a re-check is a brand new consent (spec section
 * 9's "recheck action" creates a fresh portfolio_osint_checks row with its
 * own consent_scope, it never reuses an old one).
 */

import type { PortfolioOsintSourceType } from "@/types/osint";
import type { ClaimInput } from "@/lib/osint/types";

export type ConsentSummary = {
  fields: string[];
  sourceTypes: PortfolioOsintSourceType[];
};

export type OsintConsentScope = ConsentSummary & { consentedAt: string };

const ALL_POSSIBLE_SOURCE_TYPES: readonly PortfolioOsintSourceType[] = [
  "official_organization",
  "issuer_page",
  "structured_metadata",
  "github",
  "crossref",
  "icann_rdap",
  "url_reputation",
];

/** What the consent dialog shows the student *before* they agree — every field and source type that could plausibly be touched, not just the ones a given claim happens to have (spec section 3: "show exactly which fields will be searched"). */
export function buildConsentSummary(claim: ClaimInput): ConsentSummary {
  const fields = ["studentDisplayName", "title", "url"];
  if (claim.connectedGithubUsername) fields.push("connectedGithubUsername");
  if (claim.organization) fields.push("organization");
  if (claim.role) fields.push("role");
  if (claim.startDate || claim.endDate) fields.push("dates");
  return { fields, sourceTypes: [...ALL_POSSIBLE_SOURCE_TYPES] };
}

export function freezeConsentScope(summary: ConsentSummary, now: Date = new Date()): OsintConsentScope {
  return { fields: summary.fields, sourceTypes: summary.sourceTypes, consentedAt: now.toISOString() };
}

export function validateConsentGiven(consentGiven: boolean): string | null {
  if (!consentGiven) return "You need to agree to what will be searched before we can check public sources.";
  return null;
}

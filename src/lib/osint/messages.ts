/**
 * The single source of truth for every student-facing OSINT message (spec
 * section 9) — reuses the same forbidden-language check as the human
 * verification layer (src/lib/verification/messages.ts) so "never say X"
 * stays one enforced rule across both systems rather than two copies that
 * could drift.
 */

import { containsForbiddenLanguage } from "@/lib/verification/messages";
import type { PortfolioOsintSupportLevel } from "@/types/osint";

export { containsForbiddenLanguage };

export const OSINT_SUPPORT_LEVEL_MESSAGES: Record<PortfolioOsintSupportLevel, string> = {
  confirmed_by_authoritative_source: "We found supporting public information from an official source for this entry.",
  strongly_supported: "We found supporting public information for this entry.",
  partially_supported: "We found some public information related to this entry, but it doesn't fully confirm it — this may still be valid but could use other evidence.",
  unable_to_verify: "We could not verify this publicly. That doesn't mean it isn't true — public sources simply don't cover everything.",
  needs_review: "This needs a closer look before we can say how well it's publicly supported.",
};

export const OSINT_CONFLICT_MESSAGES: Record<string, string> = {
  material_date_conflict: "The dates differ and may need clarification.",
  organization_conflict: "The organization name we found differs from what's on this entry — worth a quick double-check.",
  ambiguous_student_name: "The name on this source is common, so we can't be sure it refers to you — more evidence would help.",
  unclear_repository_ownership: "We found this repository, but your connected GitHub account doesn't appear as its owner, a contributor, or a commit author — double check the username or the repository link.",
  missing_github_identity: "Connect or enter your GitHub username so we can verify repository ownership.",
  source_silent_on_student: "We found a page about this event or program, but it doesn't mention you by name.",
  unofficial_source_only: "The only sources we found aren't official pages for this organization.",
  possible_identity_confusion: "This evidence may belong to someone else with a similar name or profile.",
};

export function buildSupportLevelMessage(level: PortfolioOsintSupportLevel): string {
  return OSINT_SUPPORT_LEVEL_MESSAGES[level];
}

export function buildRespectfulConflictMessage(reason: string, fallback = "This may still be valid but requires other evidence."): string {
  return OSINT_CONFLICT_MESSAGES[reason] ?? fallback;
}

/** Every respectful_message written to portfolio_osint_conflicts must pass this before the insert — mirrors the reviewer-notes guard in verification/actions.ts. */
export function assertRespectfulLanguage(text: string): string | null {
  if (containsForbiddenLanguage(text)) {
    return "That message can't be shown to students as written — describe what's missing or mismatched without characterizing the student.";
  }
  return null;
}

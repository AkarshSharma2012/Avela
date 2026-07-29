/**
 * Classifies a verifier's email into one of the spec's eight documented
 * categories (section 5) — pure decision logic over the signals
 * domain-context.ts gathers, so every rule is unit-testable without a real
 * DNS lookup. Degrades to `manual_review_required` on any missing/failed
 * signal rather than guessing, and never throws into the request flow.
 *
 * This classification is always supporting context, never proof: nothing
 * downstream may read `organization_domain_aligned` as "this person works
 * there," only as one more (weak) positive input alongside whatever a
 * verifier actually confirms field-by-field.
 */

import { TRUSTED_ORGANIZATION_DOMAINS } from "@/lib/verification/constants";
import { organizationNameMatchesDomain, type DomainContextResult } from "@/lib/verification/domain-context";
import type { VerifierDomainClassification } from "@/types/database";

/** The first entry in the small hand-curated allowlist whose domain plausibly matches the organization name — never a guarantee, just a starting point for detecting an outright domain_mismatch. */
export function findKnownOfficialDomain(organization: string | null): string | null {
  if (!organization) return null;
  return TRUSTED_ORGANIZATION_DOMAINS.find((domain) => organizationNameMatchesDomain(organization, domain)) ?? null;
}

export type ClassifyVerifierInput = {
  organization: string | null;
  context: DomainContextResult | null;
  /** Computed elsewhere (spec section 9's anti-collusion signals) — this module doesn't do its own cross-student querying. */
  isRepeatedAcrossUnrelatedStudents?: boolean;
};

export function classifyVerifierDomain(input: ClassifyVerifierInput): VerifierDomainClassification {
  if (!input.context) return "manual_review_required";

  if (input.context.isDisposable) return "suspicious_or_disposable";
  if (input.isRepeatedAcrossUnrelatedStudents) return "repeated_verifier_pattern";

  const knownOfficialDomain = findKnownOfficialDomain(input.organization);
  if (knownOfficialDomain && input.context.domain !== knownOfficialDomain) return "domain_mismatch";

  if (!input.context.hasMx) return "manual_review_required";
  if (input.context.isRoleMailbox) return "role_mailbox";
  if (input.context.isFreeEmailProvider) return "personal_or_free_email";
  if (input.context.organizationDomainMatch) return "organization_domain_aligned";

  return "organization_domain_unconfirmed";
}

/** Short, neutral, student-facing copy for each classification — never implies proof of employment (spec section 5/12). */
export const VERIFIER_DOMAIN_CLASSIFICATION_MESSAGES: Record<VerifierDomainClassification, string> = {
  organization_domain_aligned: "This verifier's email domain matches the organization.",
  organization_domain_unconfirmed: "We couldn't confirm this verifier's email domain against the organization — you can still continue.",
  personal_or_free_email: "This confirms participation, but not organizational authority.",
  role_mailbox: "This is a shared/general mailbox rather than an individual's — it can still confirm participation.",
  domain_mismatch: "This email does not match the organization's website. You may still continue.",
  suspicious_or_disposable: "This email address needs a closer look before we can use it.",
  repeated_verifier_pattern: "This confirmation needs review.",
  manual_review_required: "We could not check this publicly. You can add evidence instead.",
};

/** Classifications that route to a reviewer queue rather than resolving automatically — never an automatic rejection (spec section 9). */
export const CLASSIFICATIONS_REQUIRING_REVIEW: readonly VerifierDomainClassification[] = [
  "suspicious_or_disposable",
  "repeated_verifier_pattern",
];

export function classificationNeedsReview(classification: VerifierDomainClassification): boolean {
  return CLASSIFICATIONS_REQUIRING_REVIEW.includes(classification);
}

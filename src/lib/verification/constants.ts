import type { PortfolioVerificationLevel, PortfolioVerificationMethod } from "@/types/database";

export const VERIFICATION_LEVELS: readonly { value: PortfolioVerificationLevel; label: string; description: string }[] = [
  { value: "unverified", label: "Unverified", description: "A student-entered claim with no supporting evidence yet." },
  { value: "evidence_added", label: "Evidence added", description: "Supporting file, link, certificate, or document attached." },
  {
    value: "externally_confirmed",
    label: "Externally confirmed",
    description: "Confirmed through a trusted verification method.",
  },
  {
    value: "needs_review",
    label: "Needs review",
    description: "The evidence is incomplete, inconsistent, expired, unreadable, or mismatched.",
  },
  { value: "rejected", label: "Evidence doesn't support this yet", description: "A reviewer found the evidence doesn't support this entry." },
];

export const VERIFICATION_LEVEL_LABELS: Record<PortfolioVerificationLevel, string> = Object.fromEntries(
  VERIFICATION_LEVELS.map((option) => [option.value, option.label])
) as Record<PortfolioVerificationLevel, string>;

export const VERIFICATION_METHODS: readonly { value: PortfolioVerificationMethod; label: string }[] = [
  { value: "uploaded_document", label: "Uploaded document" },
  { value: "official_url", label: "Official URL" },
  { value: "organization_email", label: "Organization email" },
  { value: "teacher_or_mentor", label: "Teacher or mentor" },
  { value: "recommendation_contact", label: "Recommendation contact" },
  { value: "manual_review", label: "Manual review" },
  { value: "system_consistency_check", label: "Automatic consistency check" },
];

export const VERIFICATION_METHOD_LABELS: Record<PortfolioVerificationMethod, string> = Object.fromEntries(
  VERIFICATION_METHODS.map((option) => [option.value, option.label])
) as Record<PortfolioVerificationMethod, string>;

// --- Field limits — mirrors the migration's own check constraints ----------

export const MAX_VERIFIER_NAME_LENGTH = 200;
export const MAX_VERIFIER_ORGANIZATION_LENGTH = 200;
export const MAX_REVIEW_NOTES_LENGTH = 2000;
export const MAX_EVIDENCE_URL_LENGTH = 2000;
export const MAX_CORRECTION_NOTE_LENGTH = 1000;
export const VERIFICATION_CODE_HASH_LENGTH = 64;

// --- Request-flow timing ----------------------------------------------------

/** How long a verifier has to act on a one-time link before it's treated as expired, independent of any UI check. */
export const VERIFICATION_LINK_EXPIRY_SECONDS = 60 * 60 * 24 * 14; // 14 days

/** Minimum time between two "resend" actions on the same active request. */
export const RESEND_COOLDOWN_SECONDS = 60 * 60 * 24; // 24 hours

/** Hard ceiling on how many times a single active request can be resent — after this the student needs to cancel and start a fresh request. */
export const MAX_RESENDS_PER_REQUEST = 3;

// --- Official-URL trust signals --------------------------------------------

/**
 * Domain suffixes that are a reasonable, general trust signal for a school
 * or government program page — never sufficient on their own to mark
 * something `externally_confirmed` (see src/lib/verification/url-check.ts),
 * only a positive input alongside the page actually supporting the claim.
 */
export const TRUSTED_DOMAIN_SUFFIXES: readonly string[] = [".edu", ".gov", ".mil"];

/**
 * A small, explicitly curated allowlist of well-known verification-relevant
 * organizations. Deliberately short and hand-maintained — being on this
 * list is about the domain being *checkable* (a stable, well-known official
 * page), never about the organization's prestige (spec section 6: paid
 * programs and prestigious organizations get no extra verification
 * weight). Extend by adding a bare hostname, e.g. "redcross.org".
 */
export const TRUSTED_ORGANIZATION_DOMAINS: readonly string[] = [
  "redcross.org",
  "unitedway.org",
  "nhs.us",
  "collegeboard.org",
  "commonapp.org",
  "usa.gov",
];

/**
 * Hostnames that are never treated as an "official page" for confirmation
 * purposes, no matter what's posted there — a personal profile on any of
 * these is evidence a student can add (evidence_added), never proof an
 * organization confirmed the claim itself.
 */
export const SOCIAL_MEDIA_HOSTS: readonly string[] = [
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "linkedin.com",
  "reddit.com",
  "youtube.com",
  "snapchat.com",
  "threads.net",
];

/** A small, well-known set of disposable-email domains — a heuristic backstop, never the only signal used to reject a verifier address. */
export const DISPOSABLE_EMAIL_DOMAINS: readonly string[] = [
  "mailinator.com",
  "tempmail.com",
  "guerrillamail.com",
  "10minutemail.com",
  "yopmail.com",
  "trashmail.com",
  "throwawaymail.com",
  "getnada.com",
];

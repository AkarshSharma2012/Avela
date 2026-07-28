import type { PortfolioOsintAuthorityLevel, PortfolioOsintSourceType, PortfolioOsintSupportLevel } from "@/types/osint";

// --- Safe-fetch limits (spec section 8) -------------------------------------

export const FETCH_TIMEOUT_MS = 8_000;
export const MAX_REDIRECTS = 3;
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_CONCURRENT_REQUESTS_PER_DOMAIN = 2;
export const MAX_REQUESTS_PER_DOMAIN_PER_MINUTE = 10;
export const ALLOWED_CONTENT_TYPES: readonly string[] = [
  "text/html",
  "application/json",
  "application/ld+json",
  "application/xml",
  "text/xml",
  "application/rdap+json",
  "application/vnd.github+json",
  "application/vnd.github.v3+json",
];

export const OSINT_USER_AGENT =
  "AvelaPortfolioVerificationBot/1.0 (+https://avela.example/bot; student-initiated public-source evidence check; respects robots.txt)";

// --- Retention (spec section 4) ---------------------------------------------

export const OSINT_EVIDENCE_RETENTION_DAYS = 180;

// --- Support levels (spec: must never be an absolute true/false) -----------

export const OSINT_SUPPORT_LEVELS: readonly { value: PortfolioOsintSupportLevel; label: string; description: string }[] = [
  {
    value: "confirmed_by_authoritative_source",
    label: "Confirmed by an authoritative source",
    description: "A direct issuer, official organization page, or trusted registry clearly names the student and the claim.",
  },
  {
    value: "strongly_supported",
    label: "Strongly supported",
    description: "Multiple independent public sources line up with this claim, though none is a direct issuer confirmation.",
  },
  {
    value: "partially_supported",
    label: "Partially supported",
    description: "Some public evidence was found, but it's incomplete or only loosely matches.",
  },
  {
    value: "unable_to_verify",
    label: "Unable to verify publicly",
    description: "No public source could be found — this doesn't mean the claim is false, only that nothing public confirms it yet.",
  },
  {
    value: "needs_review",
    label: "Needs review",
    description: "Something about the evidence needs a closer, human look before it can be scored either way.",
  },
];

export const OSINT_SUPPORT_LEVEL_LABELS: Record<PortfolioOsintSupportLevel, string> = Object.fromEntries(
  OSINT_SUPPORT_LEVELS.map((level) => [level.value, level.label])
) as Record<PortfolioOsintSupportLevel, string>;

// --- Authority levels (spec section 5) --------------------------------------

export const AUTHORITY_LEVEL_WEIGHT: Record<PortfolioOsintAuthorityLevel, number> = {
  issuer: 5,
  official_organization: 4,
  trusted_registry: 3,
  verified_public_profile: 2,
  secondary_source: 1,
  unknown: 0,
};

export const AUTHORITY_LEVEL_LABELS: Record<PortfolioOsintAuthorityLevel, string> = {
  issuer: "Direct issuer",
  official_organization: "Official organization",
  trusted_registry: "Trusted registry",
  verified_public_profile: "Verified public profile",
  secondary_source: "Secondary source",
  unknown: "Unknown source",
};

export const SOURCE_TYPE_LABELS: Record<PortfolioOsintSourceType, string> = {
  official_organization: "Official organization website",
  github: "GitHub",
  crossref: "Crossref (publications)",
  icann_rdap: "Domain registration (RDAP)",
  url_reputation: "URL reputation",
  issuer_page: "Issuer / award / certification page",
  structured_metadata: "Structured page metadata (JSON-LD)",
  other: "Other public source",
};

// --- Scoring weights (spec section 7) ---------------------------------------

export const SCORE_WEIGHTS = {
  DIRECT_VERIFIER_CONFIRMATION: 40,
  OFFICIAL_ISSUER_RECORD_MATCH: 40,
  OFFICIAL_ORG_PAGE_NAMES_STUDENT: 30,
  /** Crossref exact author+title match only — GitHub has its own weights below. */
  TRUSTED_REGISTRY_EXACT_MATCH: 25,
  // --- GitHub-specific (spec section 7's GitHub scoring table) ---
  // Ownership/contribution signals, checked by exact account login, never by
  // display-name similarity (see connectors/github.ts and github-identity.ts).
  GITHUB_OWNER_MATCH: 35,
  GITHUB_CONTRIBUTOR_MATCH: 25,
  GITHUB_COMMIT_AUTHOR_MATCH: 20,
  GITHUB_DATES_ALIGN: 10,
  GITHUB_README_MATCH: 10,
  GITHUB_DEPLOYMENT_URL_MATCH: 10,
  /** Weak, name-only fallback signals — deliberately the smallest weights in the whole table; can never on their own reach strongly_supported or confirmed. */
  GITHUB_TITLE_ONLY_MATCH: 3,
  GITHUB_DISPLAY_NAME_ONLY_MATCH: 2,
  INDEPENDENT_SUPPORTING_SOURCE: 15,
  UPLOADED_SUPPORTING_EVIDENCE: 10,
  CONSISTENT_DATES_AND_ORGANIZATION: 5,
  CONFLICTING_DATES: -15,
  ORGANIZATION_MISMATCH: -15,
  EXPIRED_CREDENTIAL: -10,
  UNSAFE_OR_SUSPICIOUS_URL: -25,
  REUSED_EVIDENCE_ACROSS_UNRELATED_CLAIMS: -10,
} as const;

export const SCORE_MIN = 0;
export const SCORE_MAX = 100;

// --- Matching thresholds -----------------------------------------------------

export const TITLE_SIMILARITY_STRONG_THRESHOLD = 0.6;
export const ORGANIZATION_SIMILARITY_STRONG_THRESHOLD = 0.6;
export const NAME_SIMILARITY_STRONG_THRESHOLD = 0.7;
export const DATE_OVERLAP_TOLERANCE_DAYS = 45;

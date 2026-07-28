/**
 * Shared shapes for the OSINT engine — pure types, no runtime code. A
 * connector never sees more than a ClaimInput (spec section 1: "accept only
 * the minimum claim data needed") and always normalizes to NormalizedEvidence
 * before anything is persisted (see repository.ts).
 */

import type { PortfolioOsintAuthorityLevel, PortfolioOsintSourceType } from "@/types/osint";

/**
 * The public-verification-eligible claim categories (spec section 2) —
 * distinct from PortfolioItemType because the portfolio schema has no
 * dedicated "publication" or "event" item type. See claim-eligibility.ts
 * for the item_type -> claim type mapping and the ineligible list
 * (recommendation contacts, essays, private documents, family
 * responsibilities, informal/private activities).
 */
export type OsintClaimType =
  | "project"
  | "award"
  | "certification"
  | "course"
  | "publication"
  | "public_volunteer_role"
  | "public_leadership_role"
  | "public_work_experience"
  | "public_event_participation";

/** The minimum claim data a connector is given — never a full portfolio item, never contact info, never private fields. */
export type ClaimInput = {
  claimType: OsintClaimType;
  studentDisplayName: string;
  title: string;
  organization: string | null;
  role: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  url: string | null;
  /** The student's connected GitHub username for this claim (normalized — see github-identity.ts), if any. The only signal the github connector may treat as an ownership identity; never derived from studentDisplayName. */
  connectedGithubUsername: string | null;
};

/** What every connector must normalize its findings to before they're ever written to portfolio_osint_evidence. */
export type NormalizedEvidence = {
  sourceType: PortfolioOsintSourceType;
  sourceUrl: string;
  sourceDomain: string;
  authorityLevel: PortfolioOsintAuthorityLevel;
  /** Minimal, structured facts only — never a full page excerpt or copied body text. */
  extractedFields: Record<string, string | number | boolean | null>;
  /** 0-100: this connector's own confidence that the finding actually matches the claim — a matching-signal input to scoring.ts, not the final score itself. */
  confidence: number;
  retrievedAt: string;
};

export type ConnectorOutcome =
  | { ok: true; evidence: NormalizedEvidence[] }
  | { ok: false; reason: string };

export type ConnectorName = "official_page" | "github" | "crossref" | "icann_rdap" | "url_reputation";

export type Connector = {
  name: ConnectorName;
  /** Whether this connector is even applicable to the given claim — e.g. github only runs when the claim has a github.com URL. Independent of eligibility (claim-eligibility.ts), which gates the whole check. */
  applies(claim: ClaimInput): boolean;
  run(claim: ClaimInput): Promise<ConnectorOutcome>;
};

export type ManualReviewReason =
  | "ambiguous_student_name"
  | "material_date_conflict"
  | "organization_conflict"
  | "unclear_repository_ownership"
  | "missing_github_identity"
  | "source_silent_on_student"
  | "unofficial_source_only"
  | "possible_identity_confusion";

export type MatchAssessment = {
  titleSimilarity: number;
  organizationSimilarity: number | null;
  nameSimilarity: number | null;
  dateOverlap: number | null;
  roleMatch: boolean | null;
  credentialIdMatch: boolean | null;
  manualReviewReasons: ManualReviewReason[];
};

export type ScoreContribution = {
  label: string;
  points: number;
};

export type ScoringResult = {
  score: number;
  contributions: ScoreContribution[];
  supportLevel: import("@/types/osint").PortfolioOsintSupportLevel;
  explanation: string[];
};

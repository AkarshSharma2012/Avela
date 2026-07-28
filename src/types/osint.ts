// Backed by public.portfolio_osint_checks / public.portfolio_osint_evidence /
// public.portfolio_osint_conflicts / public.portfolio_osint_review_events —
// see supabase/migrations/20260804000000_portfolio_osint.sql. Re-exports
// enum types from database.ts rather than redeclaring them (same convention
// as types/verification.ts).

import type { Database } from "@/types/database";

export type {
  PortfolioOsintAuthorityLevel,
  PortfolioOsintCheckStatus,
  PortfolioOsintConflictSeverity,
  PortfolioOsintReviewAction,
  PortfolioOsintSourceType,
  PortfolioOsintSupportLevel,
} from "@/types/database";

export type PortfolioOsintCheck = Database["public"]["Tables"]["portfolio_osint_checks"]["Row"];

export type PortfolioOsintEvidence = Database["public"]["Tables"]["portfolio_osint_evidence"]["Row"];

export type PortfolioOsintConflict = Database["public"]["Tables"]["portfolio_osint_conflicts"]["Row"];

export type PortfolioOsintReviewEvent = Database["public"]["Tables"]["portfolio_osint_review_events"]["Row"];

/** What the student consented to search — frozen onto the check row at start time (spec section 3). */
export type OsintConsentScope = {
  fields: string[];
  sourceTypes: import("@/types/database").PortfolioOsintSourceType[];
  consentedAt: string;
};

/** A full check with its evidence and conflicts — the shape the item workspace and reviewer panel read. */
export type OsintCheckWithFindings = PortfolioOsintCheck & {
  evidence: PortfolioOsintEvidence[];
  conflicts: PortfolioOsintConflict[];
};

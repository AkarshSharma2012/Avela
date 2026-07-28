// Backed by public.portfolio_verifications / public.portfolio_verification_events
// — see supabase/migrations/20260803000000_portfolio_verification.sql.
// Re-exports enum types from database.ts rather than redeclaring them (same
// convention as types/portfolio.ts).

import type { Database } from "@/types/database";

export type {
  PortfolioVerificationActorType,
  PortfolioVerificationEventType,
  PortfolioVerificationLevel,
  PortfolioVerificationMethod,
} from "@/types/database";

export type PortfolioVerification = Database["public"]["Tables"]["portfolio_verifications"]["Row"];

export type PortfolioVerificationEvent = Database["public"]["Tables"]["portfolio_verification_events"]["Row"];

/** Extra bookkeeping kept in `metadata` rather than its own column — see the migration's comment on that column. */
export type PortfolioVerificationMetadata = {
  declined_at?: string;
  cancelled_at?: string;
  correction_requested_at?: string;
  correction_note?: string;
  resend_count?: number;
  last_sent_at?: string;
  evidence_expires_at?: string;
  official_url_domain?: string;
};

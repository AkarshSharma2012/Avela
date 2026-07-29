// Backed by public.claim_dimension_results / public.claim_dimension_events —
// see supabase/migrations/20260806000000_claim_dimensions.sql. Re-exports
// enum types from database.ts rather than redeclaring them (same convention
// as types/verification.ts).

import type { Database } from "@/types/database";

export type { ClaimDimension, ClaimDimensionStatus, PortfolioVerificationActorType } from "@/types/database";

export type ClaimDimensionResult = Database["public"]["Tables"]["claim_dimension_results"]["Row"];

export type ClaimDimensionEvent = Database["public"]["Tables"]["claim_dimension_events"]["Row"];

/** Pointers only — never file bytes or full document text, mirroring PortfolioVerificationMetadata's convention. */
export type ClaimDimensionEvidenceRef = {
  verification_id?: string;
  evidence_file_id?: string;
  evidence_url?: string;
  connected_identity_id?: string;
  osint_check_id?: string;
  research_result_hash?: string;
  field_confirmation_id?: string;
};

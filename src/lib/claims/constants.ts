import type { ClaimDimension, ClaimDimensionStatus } from "@/types/claims";

/** Every dimension the model tracks — order here is display order, not priority. */
export const ALL_CLAIM_DIMENSIONS: readonly ClaimDimension[] = [
  "identity_control",
  "project_or_activity_exists",
  "account_or_asset_control",
  "authorship_or_contribution",
  "role",
  "dates_and_duration",
  "organization_relationship",
  "award_or_credential",
  "output_or_deliverable",
  "impact_or_outcome",
  "third_party_confirmation",
];

export const ALL_CLAIM_DIMENSION_STATUSES: readonly ClaimDimensionStatus[] = [
  "not_checked",
  "unable_to_verify",
  "partially_supported",
  "strongly_supported",
  "externally_confirmed",
  "needs_review",
];

/** Short, neutral, student-facing label — never "verified"/"unverified" alone, per spec section 3. */
export const CLAIM_DIMENSION_LABELS: Record<ClaimDimension, string> = {
  identity_control: "Your identity",
  project_or_activity_exists: "Project found",
  account_or_asset_control: "Account or asset control",
  authorship_or_contribution: "Your contribution",
  role: "Your role",
  dates_and_duration: "Dates and duration",
  organization_relationship: "Organization relationship",
  award_or_credential: "Award or credential",
  output_or_deliverable: "What you made",
  impact_or_outcome: "Impact or outcome",
  third_party_confirmation: "Third-party confirmation",
};

export const CLAIM_DIMENSION_STATUS_LABELS: Record<ClaimDimensionStatus, string> = {
  not_checked: "Not checked",
  unable_to_verify: "Could not check publicly",
  partially_supported: "Partially supported",
  strongly_supported: "Strongly supported",
  externally_confirmed: "Confirmed",
  needs_review: "Needs review",
};

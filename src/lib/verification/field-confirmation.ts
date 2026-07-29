/**
 * Field-specific verifier confirmation (spec section 5): a verifier
 * responds per field, never with one "confirm everything" button. Maps
 * each field to the claim dimension(s) it actually supports — never all of
 * them — so confirming, say, dates never implies impact was confirmed too.
 */

import type { ClaimDimension } from "@/types/claims";
import type { VerificationFieldConfirmationField, VerificationFieldConfirmationResponse } from "@/types/database";

export const VERIFICATION_FIELD_OPTIONS: readonly { value: VerificationFieldConfirmationField; label: string }[] = [
  { value: "participation", label: "I can confirm participation" },
  { value: "role", label: "I can confirm the role" },
  { value: "dates", label: "I can confirm the dates" },
  { value: "hours", label: "I can confirm the hours" },
  { value: "outcome", label: "I can confirm the stated outcome" },
];

export const VERIFICATION_FIELD_RESPONSE_OPTIONS: readonly { value: VerificationFieldConfirmationResponse; label: string }[] = [
  { value: "can_confirm", label: "I can confirm this" },
  { value: "cannot_confirm", label: "I cannot confirm this detail" },
  { value: "needs_correction", label: "This detail needs correction" },
];

/** Which dimension(s) a `can_confirm` response on this field actually supports — deliberately narrow, per-field, never the whole entry. */
export const FIELD_TO_DIMENSIONS: Record<VerificationFieldConfirmationField, readonly ClaimDimension[]> = {
  participation: ["project_or_activity_exists", "authorship_or_contribution"],
  role: ["role"],
  dates: ["dates_and_duration"],
  hours: ["dates_and_duration"],
  outcome: ["impact_or_outcome"],
};

/** Every field confirmation, of any response, supports the third_party_confirmation dimension — a legitimate third party responded to *something* specific, which is what that dimension exists to record (spec's own dimension list). */
export const THIRD_PARTY_CONFIRMATION_DIMENSION: ClaimDimension = "third_party_confirmation";

export function dimensionsForFieldConfirmation(field: VerificationFieldConfirmationField, response: VerificationFieldConfirmationResponse): ClaimDimension[] {
  if (response !== "can_confirm") return [];
  return [...FIELD_TO_DIMENSIONS[field]];
}

/**
 * The claim-dimension status state machine — which statuses each actor is
 * allowed to *set*, independent of the current status (cloned from
 * src/lib/verification/level.ts's shape; see that file for the from/to
 * rationale). Pure and dependency-free so every rule is unit-testable
 * without a database.
 *
 * A student may only ever self-report `partially_supported` on a dimension —
 * a student's own say-so is real supporting context (spec section 3's
 * `uploaded evidence never equals external confirmation`), but never enough
 * to reach `strongly_supported`, `externally_confirmed`, or resolve a
 * `needs_review` flag. `not_checked` never appears as a target for any
 * actor — nothing "un-checks" a dimension; a material edit instead sets the
 * `stale` flag (see material-hash.ts) without necessarily resetting status.
 */

import type { ClaimDimensionStatus, PortfolioVerificationActorType } from "@/types/claims";

const ACTOR_ALLOWED_TARGETS: Record<PortfolioVerificationActorType, readonly ClaimDimensionStatus[]> = {
  student: ["partially_supported"],
  system: ["unable_to_verify", "partially_supported", "strongly_supported", "needs_review"],
  // A verifier is a legitimate third party by definition (the spec's own
  // third_party_confirmation dimension exists for exactly this), so a
  // verifier's field-specific confirmation may reach externally_confirmed —
  // but only ever for the specific dimension(s) their confirmed fields map
  // to (see verifier-legitimacy.ts's field->dimension mapping), never as a
  // blanket "confirm everything".
  verifier: ["strongly_supported", "externally_confirmed", "needs_review"],
  reviewer: ["unable_to_verify", "partially_supported", "strongly_supported", "externally_confirmed", "needs_review"],
};

export function canTransitionDimensionStatus(
  from: ClaimDimensionStatus,
  to: ClaimDimensionStatus,
  actor: PortfolioVerificationActorType
): boolean {
  if (from === to) return true;
  return ACTOR_ALLOWED_TARGETS[actor].includes(to);
}

export function listLegalNextDimensionStatuses(
  from: ClaimDimensionStatus,
  actor: PortfolioVerificationActorType
): ClaimDimensionStatus[] {
  return ACTOR_ALLOWED_TARGETS[actor].filter((status) => status !== from) as ClaimDimensionStatus[];
}

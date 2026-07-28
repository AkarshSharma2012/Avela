/**
 * The verification-level state machine — which levels each actor is
 * allowed to *set*, independent of the current level (a teacher/mentor can
 * confirm an item straight from `unverified` with no file attached — see
 * spec section 3C — so this is deliberately not a from→to table). Pure and
 * dependency-free so every rule is unit-testable without a database.
 * repository.ts/actions.ts never write a new verification_level without
 * checking this first, and every real transition is also recorded as a
 * portfolio_verification_events row (previous_level/new_level) regardless
 * of what this module returns.
 */

import type { PortfolioVerificationActorType, PortfolioVerificationLevel } from "@/types/database";

/**
 * `unverified` never appears as a target for any actor — nothing "un-adds"
 * evidence; the closest equivalent is a student replacing evidence, which
 * always lands back on `evidence_added` pending a fresh check. Only
 * `reviewer` can ever set `rejected`; a `verifier` declining only raises a
 * `needs_review` flag, the same way an automated check would.
 */
const ACTOR_ALLOWED_TARGETS: Record<PortfolioVerificationActorType, readonly PortfolioVerificationLevel[]> = {
  student: ["evidence_added"],
  system: ["evidence_added", "needs_review"],
  verifier: ["externally_confirmed", "needs_review"],
  reviewer: ["externally_confirmed", "needs_review", "rejected"],
};

/** `from === to` is always allowed (an idempotent re-save, e.g. a reviewer updating notes without changing the level) — everything else must be a level that actor is allowed to set at all. */
export function canTransitionLevel(
  from: PortfolioVerificationLevel,
  to: PortfolioVerificationLevel,
  actor: PortfolioVerificationActorType
): boolean {
  if (from === to) return true;
  return ACTOR_ALLOWED_TARGETS[actor].includes(to);
}

export function listLegalNextLevels(
  from: PortfolioVerificationLevel,
  actor: PortfolioVerificationActorType
): PortfolioVerificationLevel[] {
  const targets = ACTOR_ALLOWED_TARGETS[actor].filter((level) => level !== from);
  return [...targets];
}

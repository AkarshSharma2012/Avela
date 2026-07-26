import type { OpportunitySourceTrustLevel } from "@/types/database";

/**
 * Cross-source field conflict detection (Milestone 7 spec section 9).
 * "Two sources disagree" is not automatically a conflict needing a human:
 * a strictly-higher-trust new source superseding a lower-trust old value
 * is an authoritative update (same trust-ranking rule Milestone 6's
 * primary-source-link logic already uses), and a new deadline one
 * calendar year ahead of a now-past existing one looks like the same
 * recurring program's next cycle, not a factual disagreement — it still
 * needs a quick human confirmation (a new `new_cycle_unconfirmed` review
 * reason), but it must never silently block `verified_*` the way a real
 * conflict does. Only a same-cycle, similar-trust, differing value is a
 * genuine unresolved conflict.
 */

export type ConflictVerdict =
  | { kind: "no_conflict" }
  | { kind: "resolved_by_trust"; reason: string }
  | { kind: "cycle_rollover"; reason: string }
  | { kind: "conflict"; reason: string };

function trustRank(level: OpportunitySourceTrustLevel | null): number {
  return level === "high" ? 3 : level === "medium" ? 2 : level === "low" ? 1 : 0;
}

export function detectDeadlineConflict(
  existingDeadline: string | null,
  newDeadline: string | null,
  existingTrustLevel: OpportunitySourceTrustLevel | null,
  newTrustLevel: OpportunitySourceTrustLevel | null,
  now: Date = new Date()
): ConflictVerdict {
  if (existingDeadline === null || newDeadline === null) return { kind: "no_conflict" };

  const existing = new Date(existingDeadline);
  const incoming = new Date(newDeadline);
  if (existing.toISOString().slice(0, 10) === incoming.toISOString().slice(0, 10)) {
    return { kind: "no_conflict" };
  }

  if (trustRank(newTrustLevel) > trustRank(existingTrustLevel)) {
    return { kind: "resolved_by_trust", reason: "Newer, more-official source supersedes the prior deadline." };
  }

  const looksLikeRollover =
    incoming.getUTCFullYear() > existing.getUTCFullYear() && existing.getTime() < now.getTime();
  if (looksLikeRollover) {
    return {
      kind: "cycle_rollover",
      reason: `Deadline moved from ${existingDeadline.slice(0, 10)} to ${newDeadline.slice(0, 10)} — looks like next year's cycle, not a disagreement. Confirm before treating as final.`,
    };
  }

  return {
    kind: "conflict",
    reason: `Deadline conflict: existing record says ${existingDeadline.slice(0, 10)}, new source says ${newDeadline.slice(0, 10)}.`,
  };
}

export function detectGradeRangeConflict(
  existing: { minGrade: number | null; maxGrade: number | null },
  incoming: { minGrade: number | null; maxGrade: number | null },
  existingTrustLevel: OpportunitySourceTrustLevel | null,
  newTrustLevel: OpportunitySourceTrustLevel | null
): ConflictVerdict {
  if (
    (existing.minGrade === null && existing.maxGrade === null) ||
    (incoming.minGrade === null && incoming.maxGrade === null)
  ) {
    return { kind: "no_conflict" };
  }

  if (existing.minGrade === incoming.minGrade && existing.maxGrade === incoming.maxGrade) {
    return { kind: "no_conflict" };
  }

  if (trustRank(newTrustLevel) > trustRank(existingTrustLevel)) {
    return { kind: "resolved_by_trust", reason: "Newer, more-official source supersedes the prior grade range." };
  }

  return {
    kind: "conflict",
    reason: `Grade range conflict: existing record says grades ${existing.minGrade ?? "?"}-${existing.maxGrade ?? "?"}, new source says ${incoming.minGrade ?? "?"}-${incoming.maxGrade ?? "?"}.`,
  };
}

export type ConflictCheckResult = {
  hasUnresolvedConflict: boolean;
  needsCycleConfirmation: boolean;
  reasons: string[];
};

/** Combines every field-level verdict into one summary for `ingestion-runner.ts` to act on: an unresolved conflict blocks `verified_*` labeling and queues `conflicting_sources`; a cycle rollover queues the softer `new_cycle_unconfirmed` reason without blocking verification. */
export function summarizeConflicts(verdicts: readonly ConflictVerdict[]): ConflictCheckResult {
  const reasons: string[] = [];
  let hasUnresolvedConflict = false;
  let needsCycleConfirmation = false;

  for (const verdict of verdicts) {
    if (verdict.kind === "conflict") {
      hasUnresolvedConflict = true;
      reasons.push(verdict.reason);
    } else if (verdict.kind === "cycle_rollover") {
      needsCycleConfirmation = true;
      reasons.push(verdict.reason);
    }
  }

  return { hasUnresolvedConflict, needsCycleConfirmation, reasons };
}

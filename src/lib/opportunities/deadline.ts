import type { OpportunityDeadlineStatus } from "@/types/database";

export type DeadlineEvaluationInput = {
  /** ISO timestamp, or `null` if no exact deadline is known. */
  applicationDeadline: string | null;
  /** Explicit rolling-admissions signal — distinct from "no deadline known". */
  isRollingAdmission?: boolean;
  /** If applications haven't opened yet, when they do. */
  applicationOpensAt?: string | null;
  /** e.g. "annual" — a program that repeats every cycle. `null`/omitted means one-off or unknown. */
  recurrencePattern?: string | null;
};

export type DeadlineEvaluation = {
  status: OpportunityDeadlineStatus;
  reason: string;
};

/**
 * Classifies an opportunity's deadline into the five states the spec
 * requires, using only what's actually known — never inferring "open" just
 * because a page exists. Mirrors `format.ts`'s `isDeadlinePassed` convention
 * of a strict `<` comparison (a deadline at the exact current instant still
 * counts as open), so the two stay consistent.
 *
 * The one non-obvious rule: a recurring program (`recurrencePattern` set)
 * whose stored deadline falls in a calendar year before `now`'s is treated
 * as `unknown`, not `closed` — that date is very likely last year's cycle
 * that was never refreshed, and silently showing it as "closed" would be
 * just as wrong as silently showing it as "open". A deadline that has
 * merely passed *within* the current year is genuinely `closed` for this
 * cycle; recheck.ts still schedules it for revalidation before next cycle.
 */
export function evaluateDeadline(
  input: DeadlineEvaluationInput,
  now: Date = new Date()
): DeadlineEvaluation {
  const isRecurring = Boolean(input.recurrencePattern);

  if (input.isRollingAdmission) {
    return { status: "rolling", reason: "Rolling admissions — no fixed deadline." };
  }

  if (input.applicationOpensAt) {
    const opensAt = new Date(input.applicationOpensAt);
    if (opensAt.getTime() > now.getTime()) {
      return {
        status: "upcoming",
        reason: `Applications open ${opensAt.toISOString().slice(0, 10)} — not yet accepting applications.`,
      };
    }
  }

  if (input.applicationDeadline === null) {
    return {
      status: "unknown",
      reason: isRecurring
        ? "This program recurs, but no confirmed deadline exists for the current cycle."
        : "No deadline information available.",
    };
  }

  const deadline = new Date(input.applicationDeadline);

  if (isRecurring && deadline.getUTCFullYear() < now.getUTCFullYear()) {
    return {
      status: "unknown",
      reason: "Last confirmed deadline was from a previous cycle — treat as unverified until rechecked.",
    };
  }

  if (deadline.getTime() < now.getTime()) {
    return {
      status: "closed",
      reason: `Deadline passed on ${deadline.toISOString().slice(0, 10)}.`,
    };
  }

  return {
    status: "open",
    reason: `Applications due ${deadline.toISOString().slice(0, 10)}.`,
  };
}

/** True only for a deadline that has definitively passed — the hard exclusion the spec requires for default search results. Recurring-stale and unknown are deliberately excluded from this, since they are not confirmed-expired. */
export function isDefinitivelyExpired(evaluation: DeadlineEvaluation): boolean {
  return evaluation.status === "closed";
}

import type { OpportunityDeadlineStatus } from "@/types/database";

const DAY_MS = 86_400_000;

/**
 * Pure function computing when an opportunity is next due for
 * revalidation, per the spec's suggested cadence. Takes `deadlineStatus`
 * (already evaluated by `deadline.ts`) plus the raw deadline rather than
 * re-deriving status itself, so the two stay in sync with whatever
 * evaluateDeadline last decided.
 *
 * Cadence:
 * - deadline within 14 days: daily
 * - deadline within 60 days: every 3 days
 * - rolling: weekly
 * - unknown: weekly
 * - upcoming / far-future ("future annual cycle"): monthly
 * - closed: quarterly (still rechecked eventually, in case it reopens for
 *   a new cycle, but much less urgently than anything currently live)
 */
export function computeNextVerificationAt(
  deadlineStatus: OpportunityDeadlineStatus,
  applicationDeadline: string | null,
  now: Date = new Date()
): Date {
  switch (deadlineStatus) {
    case "closed":
      return new Date(now.getTime() + 90 * DAY_MS);
    case "rolling":
    case "unknown":
      return new Date(now.getTime() + 7 * DAY_MS);
    case "upcoming":
      return new Date(now.getTime() + 30 * DAY_MS);
    case "open": {
      if (!applicationDeadline) return new Date(now.getTime() + 7 * DAY_MS);
      const daysUntilDeadline = (new Date(applicationDeadline).getTime() - now.getTime()) / DAY_MS;
      if (daysUntilDeadline <= 14) return new Date(now.getTime() + 1 * DAY_MS);
      if (daysUntilDeadline <= 60) return new Date(now.getTime() + 3 * DAY_MS);
      return new Date(now.getTime() + 30 * DAY_MS);
    }
    default:
      return new Date(now.getTime() + 7 * DAY_MS);
  }
}

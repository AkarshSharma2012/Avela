import type { OpportunityReviewQueueReason } from "@/types/database";

/**
 * Pure formatting/decision helpers for `scripts/opportunities-review.ts`
 * (Milestone 7 spec section 12) — kept dependency-free and
 * unit-testable, same split as every other CLI-facing engine in this
 * codebase (`review-queue.ts`'s `evaluateReviewNeed`, `coverage.ts`).
 */

export const REASON_SUGGESTED_ACTION: Record<OpportunityReviewQueueReason, string> = {
  unknown_deadline: "Recheck the source page for an explicit deadline.",
  conflicting_sources: "Compare each source's value and confirm which is correct.",
  probable_duplicate: "Confirm whether this is a duplicate of an existing listing.",
  low_confidence_grade: "Manually confirm grade eligibility from the source page.",
  unclear_application_status: "Recheck the source for explicit application-status phrasing.",
  broken_application_url: "Find and update a working application link.",
  stale_source: "Recheck the source — it hasn't been fetched successfully recently.",
  residency_citizenship_ambiguity: "Manually confirm residency/citizenship requirements.",
  new_cycle_unconfirmed: "Confirm the new cycle's deadline before treating it as final.",
};

export type ReviewQueueDisplayEntry = {
  reviewId: string;
  opportunityTitle: string | null;
  sourceName: string | null;
  reasons: OpportunityReviewQueueReason[];
  lastCheckedAt: string | null;
  createdAt: string;
};

/** One printable line per queue entry — title/source/reason/last-checked/suggested action, per the spec's required review-CLI output. */
export function formatReviewQueueEntry(entry: ReviewQueueDisplayEntry): string {
  const title = entry.opportunityTitle ?? "(untitled / raw record only)";
  const source = entry.sourceName ?? "Unknown source";
  const lastChecked = entry.lastCheckedAt ? entry.lastCheckedAt.slice(0, 10) : "never";
  const reasonList = entry.reasons.join(", ");
  const actions = [...new Set(entry.reasons.map((r) => REASON_SUGGESTED_ACTION[r]))].join(" ");
  return `[${entry.reviewId}] ${title} — ${source}\n  reasons: ${reasonList}\n  last checked: ${lastChecked}\n  suggested action: ${actions}`;
}

export type ReviewAction = { kind: "mark-reviewed" | "reject" | "recheck"; reviewId: string };

/** Parses exactly one of `--mark-reviewed=<id>`, `--reject=<id>`, `--recheck=<id>` from argv — never a free-form field/value pair, so the CLI can only ever perform one of these three fixed, safe actions. */
export function parseReviewAction(argv: readonly string[]): ReviewAction | null {
  for (const [flag, kind] of [
    ["--mark-reviewed=", "mark-reviewed"],
    ["--reject=", "reject"],
    ["--recheck=", "recheck"],
  ] as const) {
    const arg = argv.find((a) => a.startsWith(flag));
    if (arg) return { kind, reviewId: arg.slice(flag.length) };
  }
  return null;
}

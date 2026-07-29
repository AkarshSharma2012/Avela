/**
 * Projects a set of per-dimension results into a short student-facing
 * summary (spec section 12's "Support level: Strong / ✓ Account connected /
 * ○ Impact was not checked" shape). Pure and display-only — this never
 * writes to the database, and in particular never writes back to
 * portfolio_verifications.verification_level, which stays exactly as it
 * behaved before this milestone. A future read path may show both side by
 * side, but neither one derives the other in the database.
 */

import { CLAIM_DIMENSION_LABELS, CLAIM_DIMENSION_STATUS_LABELS } from "@/lib/claims/constants";
import type { ClaimDimension, ClaimDimensionResult, ClaimDimensionStatus } from "@/types/claims";

export type ClaimDimensionSummaryRow = {
  dimension: ClaimDimension;
  label: string;
  status: ClaimDimensionStatus;
  statusLabel: string;
  stale: boolean;
};

export type ClaimSupportLevel = "strong" | "some_support" | "not_yet_supported" | "needs_review";

export type ClaimSupportSummary = {
  level: ClaimSupportLevel;
  headline: string;
  checkedCount: number;
  totalCount: number;
  rows: ClaimDimensionSummaryRow[];
};

const STRONG_STATUSES: readonly ClaimDimensionStatus[] = ["strongly_supported", "externally_confirmed"];
const SUPPORTING_STATUSES: readonly ClaimDimensionStatus[] = ["partially_supported", "strongly_supported", "externally_confirmed"];

/**
 * A single confirmed dimension must never be enough to call the whole entry
 * "Strong" — that's exactly the failure mode spec section 1 rules out
 * ("one successful check must never verify the entire entry"). Requiring a
 * minimum breadth of *checked* dimensions before "strong" is reachable means
 * a lone GitHub-identity confirmation, on its own, caps out at
 * "some_support" — the headline can only read as strong once several
 * independent dimensions have actually been looked at, not just one.
 */
const MIN_CHECKED_DIMENSIONS_FOR_STRONG = 3;

const LEVEL_HEADLINES: Record<ClaimSupportLevel, string> = {
  strong: "Strong",
  some_support: "Some support",
  not_yet_supported: "Not yet supported",
  needs_review: "Needs review",
};

export function summarizeClaimDimensions(dimensions: ClaimDimensionResult[]): ClaimSupportSummary {
  const rows: ClaimDimensionSummaryRow[] = dimensions
    .map((row) => ({
      dimension: row.dimension,
      label: CLAIM_DIMENSION_LABELS[row.dimension],
      status: row.status,
      statusLabel: CLAIM_DIMENSION_STATUS_LABELS[row.status],
      stale: row.stale,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const checked = rows.filter((row) => row.status !== "not_checked");
  const needsReview = rows.some((row) => row.status === "needs_review");
  const strongCount = checked.filter((row) => STRONG_STATUSES.includes(row.status)).length;
  const supportingCount = checked.filter((row) => SUPPORTING_STATUSES.includes(row.status)).length;

  let level: ClaimSupportLevel;
  if (needsReview) {
    level = "needs_review";
  } else if (checked.length === 0) {
    level = "not_yet_supported";
  } else if (
    checked.length >= MIN_CHECKED_DIMENSIONS_FOR_STRONG &&
    strongCount > 0 &&
    strongCount >= Math.ceil(checked.length / 2)
  ) {
    level = "strong";
  } else if (supportingCount > 0) {
    level = "some_support";
  } else {
    level = "not_yet_supported";
  }

  return {
    level,
    headline: LEVEL_HEADLINES[level],
    checkedCount: checked.length,
    totalCount: rows.length,
    rows,
  };
}

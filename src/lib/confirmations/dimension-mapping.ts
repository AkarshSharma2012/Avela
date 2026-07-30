/**
 * Maps a reviewer's plain-language response (spec Part 10) to a claim
 * dimension status. Kept in its own (non "use server") module so it's a
 * plain, directly unit-testable function — actions.ts's "use server"
 * directive requires every top-level export to be an async function, so a
 * pure lookup can't live there.
 *
 * "cannot_verify" never downgrades a dimension — not knowing something is
 * not evidence against it, so it maps to null (no change).
 */

import type { ConfirmationResponseStatus } from "@/types/portfolio";

export function responseStatusToDimensionStatus(
  status: ConfirmationResponseStatus
): "externally_confirmed" | "strongly_supported" | "partially_supported" | null {
  switch (status) {
    case "can_confirm":
      return "externally_confirmed";
    case "mostly_accurate":
      return "strongly_supported";
    case "can_confirm_participation_only":
      return "partially_supported";
    case "cannot_verify":
      return null;
  }
}

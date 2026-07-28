import type { Opportunity } from "@/types/opportunity";

/** Spec section 8: "closed or expired opportunities should show a warning" — inactive, past its deadline, or no longer accepting applications, any of which means a plan tracking it may no longer be actionable. */
export function isOpportunityClosedOrExpired(
  opportunity: Pick<Opportunity, "is_active" | "deadline_status" | "application_status">
): boolean {
  return !opportunity.is_active || opportunity.deadline_status === "closed" || opportunity.application_status === "closed";
}

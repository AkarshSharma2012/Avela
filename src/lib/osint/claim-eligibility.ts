/**
 * Which portfolio items the public-source engine may ever touch (spec
 * section 2). Deliberately an allowlist, not a denylist — a new
 * PortfolioItemType added later is ineligible by default until someone
 * explicitly maps it here, which is the safer failure direction for
 * anything OSINT-adjacent.
 */

import type { PortfolioItemType } from "@/types/portfolio";
import type { OsintClaimType } from "@/lib/osint/types";

const ITEM_TYPE_TO_CLAIM_TYPE: Partial<Record<PortfolioItemType, OsintClaimType>> = {
  project: "project",
  award: "award",
  certification: "certification",
  course: "course",
  volunteer_service: "public_volunteer_role",
  leadership: "public_leadership_role",
  work_experience: "public_work_experience",
  activity: "public_event_participation",
};

/**
 * Never eligible, regardless of content — recommendation contacts and
 * essays carry private/third-party information, documents and skills are
 * self-descriptions with nothing public to check, and "custom"/"link" are
 * too unstructured to safely classify without guessing. Publications
 * (spec section 2) are reachable through `project` — see the Crossref
 * connector's `applies()`, which runs independent of claim type whenever a
 * DOI-shaped URL is present.
 */
export function claimTypeForItemType(itemType: PortfolioItemType): OsintClaimType | null {
  return ITEM_TYPE_TO_CLAIM_TYPE[itemType] ?? null;
}

export function isOsintEligible(itemType: PortfolioItemType): boolean {
  return claimTypeForItemType(itemType) !== null;
}

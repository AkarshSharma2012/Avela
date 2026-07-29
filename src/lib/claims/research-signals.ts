/**
 * Turns a generic ResearchResult (research/types.ts) into claim-dimension
 * input — the one and only place a research finding is allowed to touch
 * the claim-dimension model, and even here it is capped at
 * `partially_supported`. A ResearchResult can never itself produce
 * `externally_confirmed`, identity confirmation, employment confirmation,
 * organizational authority, or any admissions/eligibility field (spec
 * section 13) — reaching those levels always requires a dedicated,
 * authoritative connector (the GitHub ownership check, a verifier's field
 * confirmation, a reviewer decision), never a research-adapter discovery.
 */

import type { ClaimDimension } from "@/types/claims";
import type { ResearchResult, ResearchSourceType } from "@/lib/research/types";

const SOURCE_TYPE_TO_DIMENSION: Record<ResearchSourceType, ClaimDimension | null> = {
  official_organization: "organization_relationship",
  github: "project_or_activity_exists",
  crossref: "output_or_deliverable",
  video_platform: "output_or_deliverable",
  rss_feed: "project_or_activity_exists",
  public_discussion: null, // Spec section 13: a social/discussion post never independently confirms anything on its own.
  web_search: null,
  other: null,
};

export type ResearchDimensionSuggestion = {
  dimension: ClaimDimension;
  /** Always 'partially_supported' — never higher, regardless of the research result's own confidence. */
  status: "partially_supported";
  note: string;
};

/** Never returns externally_confirmed, never returns a dimension for a low-authority/social source. */
export function suggestDimensionFromResearchResult(result: ResearchResult): ResearchDimensionSuggestion | null {
  const dimension = SOURCE_TYPE_TO_DIMENSION[result.sourceType];
  if (!dimension) return null;
  if (result.confidence < 15) return null;

  return {
    dimension,
    status: "partially_supported",
    note: `Discovered via ${result.connectorName} — supporting context only.`,
  };
}

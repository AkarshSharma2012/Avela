import { createSinglePageAdapter } from "@/lib/opportunities/adapters/single-page-adapter";
import type { OpportunitySourceAdapter } from "@/lib/opportunities/adapters/types";
import type { DnsLookupFn, FetchFn } from "@/lib/opportunities/url-safety";

/**
 * MIT's Introduction to Technology, Engineering, and Science (MITES) —
 * a real, official university source. Vetted before implementation (see
 * docs/opportunity-sources.md): robots.txt only blocks `/wp-admin/`, and
 * the page has explicit grade text across its sub-programs ("rising
 * high school seniors" / "7th-12th grade") and free-cost text. No
 * explicit deadline text was found on the fetched page — left `null`
 * rather than guessed, so this listing surfaces as
 * `partially_verified_deadline_unclear` until a future recheck finds one,
 * not silently upgraded to a firm deadline.
 */
export const MIT_MITES_SOURCE = {
  name: "MIT Introduction to Technology, Engineering, and Science (MITES)",
  baseUrl: "https://mites.mit.edu/",
  sourceType: "university" as const,
  trustLevel: "high" as const,
  crawlMethod: "html_scrape" as const,
  requiresJavascript: false,
};

export function createMitMitesAdapter(
  sourceId: string,
  options: { fetchImpl?: FetchFn; dnsLookupImpl?: DnsLookupFn } = {}
): OpportunitySourceAdapter {
  return createSinglePageAdapter({ sourceId, pageUrl: MIT_MITES_SOURCE.baseUrl, ...options });
}

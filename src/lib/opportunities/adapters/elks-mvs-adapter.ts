import { createSinglePageAdapter } from "@/lib/opportunities/adapters/single-page-adapter";
import type { OpportunitySourceAdapter } from "@/lib/opportunities/adapters/types";
import type { DnsLookupFn, FetchFn } from "@/lib/opportunities/url-safety";

/**
 * The Elks National Foundation "Most Valuable Student" Scholarship — a
 * real, official national scholarship nonprofit source. Vetted before
 * implementation (see docs/opportunity-sources.md): robots.txt only
 * blocks `/history/*archive/PDF` paths, and the page has explicit grade
 * eligibility ("current high school seniors"), a citizenship requirement
 * ("citizens of the United States"), a confirmed next-cycle deadline
 * ("2027 MVS application opens on August 1, 2026"), and award-amount
 * text.
 */
export const ELKS_MVS_SOURCE = {
  name: 'Elks National Foundation "Most Valuable Student" Scholarship',
  baseUrl: "https://www.elks.org/scholars/scholarships/MVS.cfm",
  sourceType: "nonprofit" as const,
  trustLevel: "high" as const,
  crawlMethod: "html_scrape" as const,
  requiresJavascript: false,
};

export function createElksMvsAdapter(
  sourceId: string,
  options: { fetchImpl?: FetchFn; dnsLookupImpl?: DnsLookupFn } = {}
): OpportunitySourceAdapter {
  return createSinglePageAdapter({ sourceId, pageUrl: ELKS_MVS_SOURCE.baseUrl, ...options });
}

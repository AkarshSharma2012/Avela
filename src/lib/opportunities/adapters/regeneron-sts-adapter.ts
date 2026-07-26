import { createSinglePageAdapter } from "@/lib/opportunities/adapters/single-page-adapter";
import type { OpportunitySourceAdapter } from "@/lib/opportunities/adapters/types";
import type { DnsLookupFn, FetchFn } from "@/lib/opportunities/url-safety";

/**
 * The Regeneron Science Talent Search, run by the Society for Science —
 * a real, official national STEM-competition nonprofit source. Vetted
 * before implementation (see docs/opportunity-sources.md): robots.txt
 * allows this path, and the page has an explicit deadline (November
 * 2026) and free-entry text. Grade eligibility (seniors) is described
 * rather than stated as a single verbatim eligibility sentence in the
 * fetched content, so grade extraction runs at lower confidence here —
 * flagged for review rather than assumed.
 */
export const REGENERON_STS_SOURCE = {
  name: "Regeneron Science Talent Search (Society for Science)",
  baseUrl: "https://www.societyforscience.org/regeneron-sts/",
  sourceType: "nonprofit" as const,
  trustLevel: "high" as const,
  crawlMethod: "html_scrape" as const,
  requiresJavascript: false,
};

export function createRegeneronStsAdapter(
  sourceId: string,
  options: { fetchImpl?: FetchFn; dnsLookupImpl?: DnsLookupFn } = {}
): OpportunitySourceAdapter {
  return createSinglePageAdapter({ sourceId, pageUrl: REGENERON_STS_SOURCE.baseUrl, ...options });
}

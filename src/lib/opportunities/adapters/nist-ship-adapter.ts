import { createSinglePageAdapter } from "@/lib/opportunities/adapters/single-page-adapter";
import type { OpportunitySourceAdapter } from "@/lib/opportunities/adapters/types";
import type { DnsLookupFn, FetchFn } from "@/lib/opportunities/url-safety";

/**
 * NIST's Summer High School Internship Program (SHIP) — a real, official
 * (.gov) source. Vetted before implementation (see
 * docs/opportunity-sources.md): robots.txt allows this path, the page has
 * no JSON-LD/Open Graph structured data (hence `html_scrape`), but does
 * have stable, explicit deadline-window, grade-eligibility ("high school
 * junior or senior"), and cost ("unpaid") text.
 */
export const NIST_SHIP_SOURCE = {
  name: "NIST Summer High School Internship Program (SHIP)",
  baseUrl: "https://www.nist.gov/iaao/academic-affairs-office/high-school-students-ship",
  sourceType: "government" as const,
  trustLevel: "high" as const,
  crawlMethod: "html_scrape" as const,
  requiresJavascript: false,
};

export function createNistShipAdapter(
  sourceId: string,
  options: { fetchImpl?: FetchFn; dnsLookupImpl?: DnsLookupFn } = {}
): OpportunitySourceAdapter {
  return createSinglePageAdapter({ sourceId, pageUrl: NIST_SHIP_SOURCE.baseUrl, ...options });
}

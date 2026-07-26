import { createSinglePageAdapter } from "@/lib/opportunities/adapters/single-page-adapter";
import type { OpportunitySourceAdapter } from "@/lib/opportunities/adapters/types";
import type { DnsLookupFn, FetchFn } from "@/lib/opportunities/url-safety";

/**
 * Washington State Legislature's Senate/House Page Program — a real,
 * official (.gov) state-government source. Vetted before implementation
 * (see docs/opportunity-sources.md): no robots.txt exists on leg.wa.gov
 * (a 404, conventionally "no crawl restrictions," same treatment
 * Milestone 6 gave National History Day's missing robots.txt), and the
 * page has explicit age eligibility ("at least 14 ... not reached your
 * 17th birthday"), a confirmed next-cycle application window
 * ("applications will open for the 2027 session on November 1st 2026"),
 * and daily-stipend text ($65-67/day).
 */
export const WA_PAGE_PROGRAM_SOURCE = {
  name: "Washington State Legislature Senate/House Page Program",
  baseUrl: "https://leg.wa.gov/learn-and-participate/civic-education-programs/page-program/",
  sourceType: "government" as const,
  trustLevel: "high" as const,
  crawlMethod: "html_scrape" as const,
  requiresJavascript: false,
};

export function createWaPageProgramAdapter(
  sourceId: string,
  options: { fetchImpl?: FetchFn; dnsLookupImpl?: DnsLookupFn } = {}
): OpportunitySourceAdapter {
  return createSinglePageAdapter({ sourceId, pageUrl: WA_PAGE_PROGRAM_SOURCE.baseUrl, ...options });
}

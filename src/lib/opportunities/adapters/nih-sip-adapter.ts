import { createSinglePageAdapter } from "@/lib/opportunities/adapters/single-page-adapter";
import type { OpportunitySourceAdapter } from "@/lib/opportunities/adapters/types";
import type { DnsLookupFn, FetchFn } from "@/lib/opportunities/url-safety";

/**
 * NIH's Summer Internship Program (SIP) — a real, official (.gov) source.
 * Vetted before implementation (see docs/opportunity-sources.md):
 * robots.txt allows this path, no JSON-LD/Open Graph present (hence
 * `html_scrape`), but the page has explicit deadline-window,
 * eligibility ("high school senior" or enrolled undergrad/grad student —
 * broader than NIST's high-school-only program), and stipend/cost text.
 */
export const NIH_SIP_SOURCE = {
  name: "NIH Summer Internship Program (SIP)",
  baseUrl: "https://www.training.nih.gov/research-training/pb/sip/",
  sourceType: "government" as const,
  trustLevel: "high" as const,
  crawlMethod: "html_scrape" as const,
  requiresJavascript: false,
};

export function createNihSipAdapter(
  sourceId: string,
  options: { fetchImpl?: FetchFn; dnsLookupImpl?: DnsLookupFn } = {}
): OpportunitySourceAdapter {
  return createSinglePageAdapter({ sourceId, pageUrl: NIH_SIP_SOURCE.baseUrl, ...options });
}

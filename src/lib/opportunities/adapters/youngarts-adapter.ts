import { createSinglePageAdapter } from "@/lib/opportunities/adapters/single-page-adapter";
import type { OpportunitySourceAdapter } from "@/lib/opportunities/adapters/types";
import type { DnsLookupFn, FetchFn } from "@/lib/opportunities/url-safety";

/**
 * YoungArts — a real, official national arts nonprofit source. Vetted
 * before implementation (see docs/opportunity-sources.md): robots.txt
 * allows this path, and the page has explicit grade/age eligibility
 * (grades 10-12, ages 15-18), cycle deadline dates, and free-to-apply
 * text. The apply page links to 10 discipline-specific sub-pages, but
 * they aren't exposed as distinct application deadlines in the fetched
 * content, so this ships as a single-page adapter rather than a listing
 * adapter — see docs/opportunity-sources.md for why DoSomething.org's
 * listing was chosen as this milestone's multi-record adapter target
 * instead.
 */
export const YOUNGARTS_SOURCE = {
  name: "YoungArts National Arts Competition",
  baseUrl: "https://youngarts.org/apply",
  sourceType: "nonprofit" as const,
  trustLevel: "high" as const,
  crawlMethod: "html_scrape" as const,
  requiresJavascript: false,
};

export function createYoungArtsAdapter(
  sourceId: string,
  options: { fetchImpl?: FetchFn; dnsLookupImpl?: DnsLookupFn } = {}
): OpportunitySourceAdapter {
  return createSinglePageAdapter({ sourceId, pageUrl: YOUNGARTS_SOURCE.baseUrl, ...options });
}

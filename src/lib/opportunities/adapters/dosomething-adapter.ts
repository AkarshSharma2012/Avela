import { createListingAdapter } from "@/lib/opportunities/adapters/listing-adapter";
import type { OpportunitySourceAdapter } from "@/lib/opportunities/adapters/types";
import type { DnsLookupFn, FetchFn } from "@/lib/opportunities/url-safety";

/**
 * DoSomething.org's campaign listing — a real, official national
 * youth-volunteering nonprofit source, and this milestone's multi-record
 * listing-adapter target (see docs/opportunity-sources.md: it's the one
 * candidate confirmed to be a genuine multi-item index page, with 4+
 * distinct campaigns each carrying its own deadline, rather than a single
 * program description). Vetted before implementation: robots.txt allows
 * this path.
 */
export const DOSOMETHING_SOURCE = {
  name: "DoSomething.org Campaigns",
  baseUrl: "https://www.dosomething.org/us/campaigns",
  sourceType: "nonprofit" as const,
  trustLevel: "medium" as const,
  crawlMethod: "listing_scrape" as const,
  requiresJavascript: false,
};

/** Matches an anchor's `href` to a real campaign detail page — `/us/campaigns/<slug>`, never the listing path itself or an unrelated `/us/...` page. Deliberately conservative: unmatched markup yields no links rather than a guess. */
function extractCampaignDetailUrls(html: string, listingPageUrl: string): string[] {
  const found = new Set<string>();
  const anchors = html.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi);
  for (const anchor of anchors) {
    const href = anchor[1];
    if (!/\/us\/campaigns\/[a-z0-9-]+/i.test(href)) continue;
    try {
      const resolved = new URL(href, listingPageUrl);
      resolved.hash = "";
      resolved.search = "";
      if (resolved.pathname === "/us/campaigns") continue;
      found.add(resolved.toString());
    } catch {
      continue;
    }
  }
  return [...found];
}

export function createDoSomethingAdapter(
  sourceId: string,
  options: { fetchImpl?: FetchFn; dnsLookupImpl?: DnsLookupFn } = {}
): OpportunitySourceAdapter {
  return createListingAdapter({
    sourceId,
    listingUrls: [DOSOMETHING_SOURCE.baseUrl],
    extractDetailUrls: extractCampaignDetailUrls,
    maxDetailPages: 15,
    concurrency: 3,
    ...options,
  });
}

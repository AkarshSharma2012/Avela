import { createSinglePageAdapter } from "@/lib/opportunities/adapters/single-page-adapter";
import type { OpportunitySourceAdapter } from "@/lib/opportunities/adapters/types";
import type { DnsLookupFn, FetchFn } from "@/lib/opportunities/url-safety";

/**
 * NASA's High School Aerospace Scholars (HAS) — a real, official (.gov)
 * source, run by NASA Johnson Space Center. Vetted before implementation
 * (see docs/opportunity-sources.md): robots.txt allows this path, no
 * JSON-LD/Open Graph structured data present (hence `html_scrape`), but
 * explicit grade-eligibility ("junior year of high school"), an
 * application window, and free/no-cost text are present on the page.
 */
export const NASA_HSAS_SOURCE = {
  name: "NASA High School Aerospace Scholars (HAS)",
  baseUrl: "https://www.nasa.gov/learning-resources/high-school-aerospace-scholars/",
  sourceType: "government" as const,
  trustLevel: "high" as const,
  crawlMethod: "html_scrape" as const,
  requiresJavascript: false,
};

export function createNasaHsasAdapter(
  sourceId: string,
  options: { fetchImpl?: FetchFn; dnsLookupImpl?: DnsLookupFn } = {}
): OpportunitySourceAdapter {
  return createSinglePageAdapter({ sourceId, pageUrl: NASA_HSAS_SOURCE.baseUrl, ...options });
}

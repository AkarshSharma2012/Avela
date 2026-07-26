import { computeContentHash } from "@/lib/opportunities/dedupe";
import { fetchPageForIngestion } from "@/lib/opportunities/http-fetch";
import type { DnsLookupFn, FetchFn } from "@/lib/opportunities/url-safety";
import type {
  OpportunitySourceAdapter,
  RawOpportunityRecordInput,
} from "@/lib/opportunities/adapters/types";

export type SinglePageAdapterConfig = {
  sourceId: string;
  pageUrl: string;
  fetchImpl?: FetchFn;
  dnsLookupImpl?: DnsLookupFn;
};

function toRawRecord(finalUrl: string, statusCode: number | null, checkedStatus: string, body: string): RawOpportunityRecordInput {
  return {
    sourceUrl: finalUrl,
    rawTitle: null,
    rawContent: body,
    rawMetadata: { httpStatus: statusCode, checkedStatus },
    contentHash: computeContentHash([finalUrl, body]),
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Shared implementation for adapters whose entire source is one specific,
 * hand-verified official program page (see docs/opportunity-sources.md) —
 * rather than a multi-item listing/feed/API. `discover()` returns that
 * page as a single raw record; `fetchDetails()` re-fetches the same known
 * page for a recheck (the `url` argument is accepted to satisfy the
 * `OpportunitySourceAdapter` interface, but a single-page adapter has
 * exactly one legitimate target — an unrecognized URL is rejected rather
 * than blindly fetched, consistent with "do not fetch arbitrary URLs").
 * Fails safely: a network/timeout/blocked/broken outcome from
 * `discover()` returns an empty list rather than throwing, so one
 * source's outage never crashes an ingestion run covering other sources.
 */
export function createSinglePageAdapter(config: SinglePageAdapterConfig): OpportunitySourceAdapter {
  return {
    sourceId: config.sourceId,
    async discover() {
      const result = await fetchPageForIngestion(config.pageUrl, {
        fetchImpl: config.fetchImpl,
        dnsLookupImpl: config.dnsLookupImpl,
      });
      if (result.body === null) return [];
      return [toRawRecord(result.finalUrl, result.statusCode, result.status, result.body)];
    },
    async fetchDetails(url: string) {
      if (url !== config.pageUrl) {
        throw new Error(`This adapter only knows how to fetch ${config.pageUrl}, not ${url}`);
      }
      const result = await fetchPageForIngestion(config.pageUrl, {
        fetchImpl: config.fetchImpl,
        dnsLookupImpl: config.dnsLookupImpl,
      });
      if (result.body === null) {
        throw new Error(`Could not fetch ${config.pageUrl}: classified as "${result.status}"`);
      }
      return toRawRecord(result.finalUrl, result.statusCode, result.status, result.body);
    },
  };
}

import { computeContentHash } from "@/lib/opportunities/dedupe";
import { fetchPageForIngestion } from "@/lib/opportunities/http-fetch";
import type { DnsLookupFn, FetchFn } from "@/lib/opportunities/url-safety";
import type {
  OpportunitySourceAdapter,
  RawOpportunityRecordInput,
} from "@/lib/opportunities/adapters/types";

/**
 * Multi-record listing adapter (Milestone 7 spec section 2) — for an
 * official index/listing page that enumerates several distinct
 * opportunities, unlike `single-page-adapter.ts`'s one-page-one-record
 * model. Deliberately bounded, never a general crawler: `listingUrls` is
 * an explicit, human-supplied list (no automatic "next page" link
 * following — "No unrestricted recursive crawling" per the spec), and
 * both the number of listing pages scanned and the number of detail pages
 * fetched are capped. Robots.txt/access-restriction compliance is
 * enforced the same way every adapter in this codebase enforces it —
 * a human vets the source once before it's ever added here (see
 * docs/opportunity-sources.md) — this module does not parse robots.txt
 * itself, matching `single-page-adapter.ts`'s existing convention.
 */

export type ListingAdapterConfig = {
  sourceId: string;
  /** Explicit listing/index pages to scan for detail-page links — never auto-discovered or paginated recursively. */
  listingUrls: string[];
  /** Pure function: given one listing page's fetched HTML and its final URL, returns the detail-page URLs it links to (already resolved to absolute URLs). Adapter-specific — different sites mark up their listings differently. */
  extractDetailUrls: (html: string, listingPageUrl: string) => string[];
  /** Safety cap on how many of `listingUrls` are actually scanned per `discover()` call. */
  maxListingPages?: number;
  /** Safety cap on total unique detail pages fetched per `discover()` call. */
  maxDetailPages?: number;
  /** Max simultaneous in-flight fetches (both listing and detail pages) — conservative by default. */
  concurrency?: number;
  fetchImpl?: FetchFn;
  dnsLookupImpl?: DnsLookupFn;
};

const DEFAULT_MAX_LISTING_PAGES = 5;
const DEFAULT_MAX_DETAIL_PAGES = 25;
const DEFAULT_CONCURRENCY = 3;

/** Runs `fn` over `items` with at most `limit` in flight at once — a plain worker-pool loop, no external dependency, so adapter tests can assert on real concurrency behavior via a counting `fetchImpl`. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const current = nextIndex++;
      if (current >= items.length) return;
      results[current] = await fn(items[current]);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function toRawRecord(
  finalUrl: string,
  statusCode: number | null,
  checkedStatus: string,
  body: string,
  listingPageUrl: string | null
): RawOpportunityRecordInput {
  return {
    sourceUrl: finalUrl,
    rawTitle: null,
    rawContent: body,
    rawMetadata: { httpStatus: statusCode, checkedStatus, listingPageUrl },
    contentHash: computeContentHash([finalUrl, body]),
    fetchedAt: new Date().toISOString(),
  };
}

export function createListingAdapter(config: ListingAdapterConfig): OpportunitySourceAdapter {
  const maxListingPages = config.maxListingPages ?? DEFAULT_MAX_LISTING_PAGES;
  const maxDetailPages = config.maxDetailPages ?? DEFAULT_MAX_DETAIL_PAGES;
  const concurrency = config.concurrency ?? DEFAULT_CONCURRENCY;
  const fetchOptions = { fetchImpl: config.fetchImpl, dnsLookupImpl: config.dnsLookupImpl };

  return {
    sourceId: config.sourceId,

    async discover() {
      const listingPages = config.listingUrls.slice(0, maxListingPages);

      // Each listing page's failure is isolated — one broken/blocked
      // listing page never stops the others (per-page failure isolation),
      // and never throws out of discover() (fails safely, same convention
      // as single-page-adapter.ts).
      const listingResults = await mapWithConcurrency(
        listingPages,
        concurrency,
        async (pageUrl): Promise<{ listingPageUrl: string; detailUrls: string[] }> => {
          try {
            const result = await fetchPageForIngestion(pageUrl, fetchOptions);
            if (result.body === null) return { listingPageUrl: pageUrl, detailUrls: [] };
            return {
              listingPageUrl: result.finalUrl,
              detailUrls: config.extractDetailUrls(result.body, result.finalUrl),
            };
          } catch {
            return { listingPageUrl: pageUrl, detailUrls: [] };
          }
        }
      );

      // De-dup identical detail URLs across listing pages — never fetch
      // the same detail page twice in one run — while preserving which
      // listing page first surfaced it, for evidence.
      const detailUrlToListingPage = new Map<string, string>();
      for (const { listingPageUrl, detailUrls } of listingResults) {
        for (const url of detailUrls) {
          if (!detailUrlToListingPage.has(url)) detailUrlToListingPage.set(url, listingPageUrl);
        }
      }

      const cappedDetailUrls = [...detailUrlToListingPage.keys()].slice(0, maxDetailPages);

      const records = await mapWithConcurrency(cappedDetailUrls, concurrency, async (detailUrl) => {
        try {
          const result = await fetchPageForIngestion(detailUrl, fetchOptions);
          if (result.body === null) return null;
          return toRawRecord(
            result.finalUrl,
            result.statusCode,
            result.status,
            result.body,
            detailUrlToListingPage.get(detailUrl) ?? null
          );
        } catch {
          return null;
        }
      });

      return records.filter((record): record is RawOpportunityRecordInput => record !== null);
    },

    async fetchDetails(url: string) {
      const result = await fetchPageForIngestion(url, fetchOptions);
      if (result.body === null) {
        throw new Error(`Could not fetch ${url}: classified as "${result.status}"`);
      }
      return toRawRecord(result.finalUrl, result.statusCode, result.status, result.body, null);
    },
  };
}

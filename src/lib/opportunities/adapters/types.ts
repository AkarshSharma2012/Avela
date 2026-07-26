/** What every adapter produces — matches `public.raw_opportunity_records`' insertable shape (minus the ids Postgres generates). */
export type RawOpportunityRecordInput = {
  sourceUrl: string;
  rawTitle: string | null;
  rawContent: string;
  rawMetadata: Record<string, unknown>;
  contentHash: string;
  fetchedAt: string;
};

/**
 * Provider-neutral discovery interface (spec section 10). Only safe,
 * controlled sources get an adapter in this milestone — manual JSON/CSV
 * import and a static in-memory source for development testing. No broad
 * web crawler, no Google search-result scraping, no dependency on
 * AI-generated search results as a source of truth.
 */
export interface OpportunitySourceAdapter {
  sourceId: string;
  /** Lists everything currently available from this source. */
  discover(): Promise<RawOpportunityRecordInput[]>;
  /** Fetches (or re-reads) one specific item by URL, for rechecking a single already-known listing. */
  fetchDetails(url: string): Promise<RawOpportunityRecordInput>;
}

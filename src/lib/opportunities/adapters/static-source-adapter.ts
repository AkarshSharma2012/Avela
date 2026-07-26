import { computeContentHash } from "@/lib/opportunities/dedupe";
import type {
  OpportunitySourceAdapter,
  RawOpportunityRecordInput,
} from "@/lib/opportunities/adapters/types";

/**
 * An adapter with no network or filesystem access at all — a fixed,
 * in-memory list of records, entirely for exercising the ingestion
 * pipeline (extraction → normalization → dedupe → verification) end to
 * end in development without depending on any real external source. Not
 * meant to represent a real organization; every URL below is
 * `example.org`, matching Milestone 4's sample-data convention.
 */
const DEV_RECORDS: readonly { sourceUrl: string; title: string; content: string }[] = [
  {
    sourceUrl: "https://example.org/opportunities/dev-fixture-1",
    title: "Example Summer Research Fellowship",
    content:
      "Open to 10th-12th grade students. Applications due March 15, 2027. Free program, remote-friendly.",
  },
  {
    sourceUrl: "https://example.org/opportunities/dev-fixture-2",
    title: "Example Rolling Volunteer Program",
    content: "High school students. Rolling admissions, no fixed deadline. Free.",
  },
];

export function createStaticSourceAdapter(sourceId: string): OpportunitySourceAdapter {
  function toRecord(entry: (typeof DEV_RECORDS)[number]): RawOpportunityRecordInput {
    return {
      sourceUrl: entry.sourceUrl,
      rawTitle: entry.title,
      rawContent: entry.content,
      rawMetadata: { devFixture: true },
      contentHash: computeContentHash([entry.sourceUrl, entry.title, entry.content]),
      fetchedAt: new Date().toISOString(),
    };
  }

  return {
    sourceId,
    async discover() {
      return DEV_RECORDS.map(toRecord);
    },
    async fetchDetails(url: string) {
      const entry = DEV_RECORDS.find((candidate) => candidate.sourceUrl === url);
      if (!entry) throw new Error(`No static dev fixture found for ${url}`);
      return toRecord(entry);
    },
  };
}

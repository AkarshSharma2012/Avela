import { readFileSync } from "node:fs";

import { computeContentHash } from "@/lib/opportunities/dedupe";
import type {
  OpportunitySourceAdapter,
  RawOpportunityRecordInput,
} from "@/lib/opportunities/adapters/types";

export type ManualJsonEntry = {
  sourceUrl: string;
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
};

function toRawRecord(entry: ManualJsonEntry, fetchedAt: string): RawOpportunityRecordInput {
  return {
    sourceUrl: entry.sourceUrl,
    rawTitle: entry.title ?? null,
    rawContent: entry.content,
    rawMetadata: entry.metadata ?? {},
    contentHash: computeContentHash([entry.sourceUrl, entry.title ?? "", entry.content]),
    fetchedAt,
  };
}

/**
 * Reads a local JSON file of `{ sourceUrl, title?, content, metadata? }`
 * entries — the safest possible "discovery" method (a human curated the
 * file), used for manually-vetted sources with no API/RSS feed. Node-only
 * (`node:fs`); never imported from a client component.
 */
export function createManualJsonAdapter(
  sourceId: string,
  filePath: string
): OpportunitySourceAdapter {
  return {
    sourceId,
    async discover() {
      const raw = readFileSync(filePath, "utf-8");
      const entries = JSON.parse(raw) as ManualJsonEntry[];
      const fetchedAt = new Date().toISOString();
      return entries.map((entry) => toRawRecord(entry, fetchedAt));
    },
    async fetchDetails(url: string) {
      const raw = readFileSync(filePath, "utf-8");
      const entries = JSON.parse(raw) as ManualJsonEntry[];
      const entry = entries.find((candidate) => candidate.sourceUrl === url);
      if (!entry) throw new Error(`No manual JSON entry found for ${url}`);
      return toRawRecord(entry, new Date().toISOString());
    },
  };
}

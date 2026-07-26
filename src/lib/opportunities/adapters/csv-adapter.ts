import { readFileSync } from "node:fs";

import { computeContentHash } from "@/lib/opportunities/dedupe";
import type {
  OpportunitySourceAdapter,
  RawOpportunityRecordInput,
} from "@/lib/opportunities/adapters/types";

/** Minimal RFC 4180 parser (quoted fields, embedded commas, `""` escaping) — no external CSV dependency for one simple format. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

/**
 * Reads a local CSV with a header row containing at least `source_url` and
 * `content` columns; every other column becomes `rawMetadata`. Same
 * "human curated the file" trust model as the manual JSON adapter, for
 * sources that only publish a spreadsheet export.
 */
export function createCsvAdapter(sourceId: string, filePath: string): OpportunitySourceAdapter {
  function readRecords(): RawOpportunityRecordInput[] {
    const text = readFileSync(filePath, "utf-8");
    const rows = parseCsv(text);
    if (rows.length === 0) return [];

    const [header, ...dataRows] = rows;
    const sourceUrlIndex = header.indexOf("source_url");
    const titleIndex = header.indexOf("title");
    const contentIndex = header.indexOf("content");

    if (sourceUrlIndex === -1 || contentIndex === -1) {
      throw new Error(`CSV at ${filePath} must have "source_url" and "content" columns`);
    }

    const fetchedAt = new Date().toISOString();

    return dataRows.map((row) => {
      const sourceUrl = row[sourceUrlIndex] ?? "";
      const content = row[contentIndex] ?? "";
      const title = titleIndex !== -1 ? (row[titleIndex] ?? null) : null;
      const metadata: Record<string, unknown> = {};
      header.forEach((column, index) => {
        if (index !== sourceUrlIndex && index !== titleIndex && index !== contentIndex) {
          metadata[column] = row[index] ?? "";
        }
      });

      return {
        sourceUrl,
        rawTitle: title,
        rawContent: content,
        rawMetadata: metadata,
        contentHash: computeContentHash([sourceUrl, title ?? "", content]),
        fetchedAt,
      };
    });
  }

  return {
    sourceId,
    async discover() {
      return readRecords();
    },
    async fetchDetails(url: string) {
      const record = readRecords().find((candidate) => candidate.sourceUrl === url);
      if (!record) throw new Error(`No CSV row found for ${url}`);
      return record;
    },
  };
}

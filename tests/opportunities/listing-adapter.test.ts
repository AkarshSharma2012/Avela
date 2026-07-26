import { describe, expect, it, vi } from "vitest";

import { createListingAdapter, mapWithConcurrency } from "@/lib/opportunities/adapters/listing-adapter";
import type { DnsLookupFn } from "@/lib/opportunities/url-safety";

const PUBLIC_DNS: DnsLookupFn = async () => ({ address: "93.184.216.34", family: 4 });

function makeResponse(status: number, body = ""): Response {
  return {
    status,
    headers: { get: () => null },
    text: async () => body,
  } as unknown as Response;
}

const LISTING_HTML = `<html><body>
  <a href="/programs/one">Program One</a>
  <a href="/programs/two">Program Two</a>
  <a href="/about">About us</a>
</body></html>`;

function extractProgramLinks(html: string, pageUrl: string): string[] {
  const found: string[] = [];
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    if (match[1].includes("/programs/")) found.push(new URL(match[1], pageUrl).toString());
  }
  return found;
}

describe("mapWithConcurrency", () => {
  it("never runs more than `limit` callbacks at once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (item) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return item * 2;
    });
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it("preserves result order regardless of completion order", async () => {
    const results = await mapWithConcurrency([30, 10, 20], 3, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return ms;
    });
    expect(results).toEqual([30, 10, 20]);
  });
});

describe("createListingAdapter", () => {
  it("discovers detail-page URLs from the listing page and fetches each one, returning one raw record per opportunity", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("listing")) return makeResponse(200, LISTING_HTML);
      return makeResponse(200, `<html><title>Detail for ${url}</title></html>`);
    });

    const adapter = createListingAdapter({
      sourceId: "src-listing",
      listingUrls: ["https://example.org/listing"],
      extractDetailUrls: extractProgramLinks,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      dnsLookupImpl: PUBLIC_DNS,
    });

    const records = await adapter.discover();

    expect(records).toHaveLength(2);
    expect(records.map((r) => r.sourceUrl).sort()).toEqual([
      "https://example.org/programs/one",
      "https://example.org/programs/two",
    ]);
    expect(records[0].rawMetadata).toMatchObject({ listingPageUrl: "https://example.org/listing" });
  });

  it("never fetches the same detail URL twice across multiple listing pages", async () => {
    const listingA = `<html><body><a href="/programs/one">One</a></body></html>`;
    const listingB = `<html><body><a href="/programs/one">One again</a><a href="/programs/two">Two</a></body></html>`;
    const fetchedUrls: string[] = [];

    const fetchImpl = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("listing-a")) return makeResponse(200, listingA);
      if (u.includes("listing-b")) return makeResponse(200, listingB);
      fetchedUrls.push(u);
      return makeResponse(200, `<html><title>Detail</title></html>`);
    });

    const adapter = createListingAdapter({
      sourceId: "src-listing",
      listingUrls: ["https://example.org/listing-a", "https://example.org/listing-b"],
      extractDetailUrls: extractProgramLinks,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      dnsLookupImpl: PUBLIC_DNS,
    });

    const records = await adapter.discover();

    expect(records).toHaveLength(2);
    expect(fetchedUrls.filter((u) => u.includes("/programs/one"))).toHaveLength(1);
  });

  it("caps the number of detail pages fetched at maxDetailPages", async () => {
    const manyLinksHtml = `<html><body>${Array.from(
      { length: 10 },
      (_, i) => `<a href="/programs/${i}">Program ${i}</a>`
    ).join("")}</body></html>`;

    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("listing")) return makeResponse(200, manyLinksHtml);
      return makeResponse(200, `<html><title>Detail</title></html>`);
    });

    const adapter = createListingAdapter({
      sourceId: "src-listing",
      listingUrls: ["https://example.org/listing"],
      extractDetailUrls: extractProgramLinks,
      maxDetailPages: 3,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      dnsLookupImpl: PUBLIC_DNS,
    });

    const records = await adapter.discover();
    expect(records).toHaveLength(3);
  });

  it("caps the number of listing pages scanned at maxListingPages", async () => {
    const scannedListingUrls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("listing")) {
        scannedListingUrls.push(u);
        return makeResponse(200, "<html><body></body></html>");
      }
      return makeResponse(200, "<html></html>");
    });

    const adapter = createListingAdapter({
      sourceId: "src-listing",
      listingUrls: ["https://example.org/listing-1", "https://example.org/listing-2", "https://example.org/listing-3"],
      extractDetailUrls: extractProgramLinks,
      maxListingPages: 1,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      dnsLookupImpl: PUBLIC_DNS,
    });

    await adapter.discover();
    expect(scannedListingUrls).toHaveLength(1);
  });

  it("isolates one listing page's failure — other listing pages still contribute records", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("broken-listing")) throw new Error("network down");
      if (u.includes("good-listing")) {
        return makeResponse(200, `<html><body><a href="/programs/one">One</a></body></html>`);
      }
      return makeResponse(200, "<html><title>Detail</title></html>");
    });

    const adapter = createListingAdapter({
      sourceId: "src-listing",
      listingUrls: ["https://example.org/broken-listing", "https://example.org/good-listing"],
      extractDetailUrls: extractProgramLinks,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      dnsLookupImpl: PUBLIC_DNS,
    });

    const records = await adapter.discover();
    expect(records).toHaveLength(1);
  });

  it("fails safely: discover() never throws even if every listing page is unreachable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });

    const adapter = createListingAdapter({
      sourceId: "src-listing",
      listingUrls: ["https://example.org/listing"],
      extractDetailUrls: extractProgramLinks,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      dnsLookupImpl: PUBLIC_DNS,
    });

    const records = await adapter.discover();
    expect(records).toEqual([]);
  });

  it("fetchDetails() fetches an arbitrary already-known detail URL directly", async () => {
    const fetchImpl = vi.fn(async () => makeResponse(200, "<html><title>A Program</title></html>"));
    const adapter = createListingAdapter({
      sourceId: "src-listing",
      listingUrls: ["https://example.org/listing"],
      extractDetailUrls: extractProgramLinks,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      dnsLookupImpl: PUBLIC_DNS,
    });

    const record = await adapter.fetchDetails("https://example.org/programs/one");
    expect(record.sourceUrl).toBe("https://example.org/programs/one");
  });
});

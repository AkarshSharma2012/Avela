import { describe, expect, it, vi } from "vitest";

import { createNihSipAdapter, NIH_SIP_SOURCE } from "@/lib/opportunities/adapters/nih-sip-adapter";
import { createNistShipAdapter, NIST_SHIP_SOURCE } from "@/lib/opportunities/adapters/nist-ship-adapter";
import { createSinglePageAdapter } from "@/lib/opportunities/adapters/single-page-adapter";
import type { DnsLookupFn } from "@/lib/opportunities/url-safety";

const PUBLIC_DNS: DnsLookupFn = async () => ({ address: "93.184.216.34", family: 4 });

function makeResponse(status: number, body = ""): Response {
  return {
    status,
    headers: { get: () => null },
    text: async () => body,
  } as unknown as Response;
}

describe("createSinglePageAdapter", () => {
  it("discover() returns one raw record on success, preserving the source URL as evidence", async () => {
    const fetchImpl = vi.fn(async () => makeResponse(200, "<html><title>A Program</title></html>"));
    const adapter = createSinglePageAdapter({
      sourceId: "src-1",
      pageUrl: "https://example.gov/program",
      fetchImpl,
      dnsLookupImpl: PUBLIC_DNS,
    });

    const records = await adapter.discover();

    expect(records).toHaveLength(1);
    expect(records[0].sourceUrl).toBe("https://example.gov/program");
    expect(records[0].rawContent).toContain("A Program");
    expect(records[0].contentHash).toBeTruthy();
  });

  it("fails safely: a network failure returns an empty list, not a thrown error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    const adapter = createSinglePageAdapter({
      sourceId: "src-1",
      pageUrl: "https://example.gov/program",
      fetchImpl,
      dnsLookupImpl: PUBLIC_DNS,
    });

    const records = await adapter.discover();
    expect(records).toEqual([]);
  });

  it("fails safely on a malformed/empty response body", async () => {
    const fetchImpl = vi.fn(async () => makeResponse(200, ""));
    const adapter = createSinglePageAdapter({
      sourceId: "src-1",
      pageUrl: "https://example.gov/program",
      fetchImpl,
      dnsLookupImpl: PUBLIC_DNS,
    });

    const records = await adapter.discover();
    expect(records).toHaveLength(1);
    expect(records[0].rawContent).toBe("");
  });

  it("fetchDetails() rejects a URL it doesn't recognize", async () => {
    const adapter = createSinglePageAdapter({
      sourceId: "src-1",
      pageUrl: "https://example.gov/program",
      fetchImpl: vi.fn(),
      dnsLookupImpl: PUBLIC_DNS,
    });

    await expect(adapter.fetchDetails("https://not-the-right-url.example")).rejects.toThrow();
  });

  it("fetchDetails() throws (rather than silently returning nothing) when the known page can't be fetched", async () => {
    const fetchImpl = vi.fn(async () => makeResponse(500));
    const adapter = createSinglePageAdapter({
      sourceId: "src-1",
      pageUrl: "https://example.gov/program",
      fetchImpl,
      dnsLookupImpl: PUBLIC_DNS,
    });

    await expect(adapter.fetchDetails("https://example.gov/program")).rejects.toThrow();
  });
});

describe("real source adapters", () => {
  it("NIST SHIP adapter is configured against the vetted official URL", () => {
    expect(NIST_SHIP_SOURCE.baseUrl).toBe(
      "https://www.nist.gov/iaao/academic-affairs-office/high-school-students-ship"
    );
    expect(NIST_SHIP_SOURCE.trustLevel).toBe("high");
  });

  it("NIH SIP adapter is configured against the vetted official URL", () => {
    expect(NIH_SIP_SOURCE.baseUrl).toBe("https://www.training.nih.gov/research-training/pb/sip/");
    expect(NIH_SIP_SOURCE.trustLevel).toBe("high");
  });

  it("both adapters fetch only their own known page", async () => {
    const fetchImpl = vi.fn(async () => makeResponse(200, "<html><title>Program</title></html>"));
    const nist = createNistShipAdapter("source-nist", { fetchImpl, dnsLookupImpl: PUBLIC_DNS });
    const nih = createNihSipAdapter("source-nih", { fetchImpl, dnsLookupImpl: PUBLIC_DNS });

    const [nistRecords, nihRecords] = await Promise.all([nist.discover(), nih.discover()]);

    expect(nistRecords[0]?.sourceUrl).toBe(NIST_SHIP_SOURCE.baseUrl);
    expect(nihRecords[0]?.sourceUrl).toBe(NIH_SIP_SOURCE.baseUrl);
  });
});

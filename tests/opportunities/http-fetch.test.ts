import { describe, expect, it, vi } from "vitest";

import { fetchPageForIngestion } from "@/lib/opportunities/http-fetch";
import type { DnsLookupFn } from "@/lib/opportunities/url-safety";

const PUBLIC_DNS: DnsLookupFn = async () => ({ address: "93.184.216.34", family: 4 });

function makeResponse(status: number, body = ""): Response {
  return {
    status,
    headers: { get: () => null },
    text: async () => body,
  } as unknown as Response;
}

describe("fetchPageForIngestion", () => {
  it("succeeds on the first attempt without retrying", async () => {
    const fetchImpl = vi.fn(async () => makeResponse(200, "<html>ok</html>"));
    const result = await fetchPageForIngestion("https://example.org/page", {
      fetchImpl,
      dnsLookupImpl: PUBLIC_DNS,
    });
    expect(result.status).toBe("working");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries exactly once on a transient network error, then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(makeResponse(200, "ok"));
    const result = await fetchPageForIngestion("https://example.org/flaky", {
      fetchImpl,
      dnsLookupImpl: PUBLIC_DNS,
    });
    expect(result.status).toBe("working");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries at most once — never loops indefinitely on a persistent 5xx", async () => {
    const fetchImpl = vi.fn(async () => makeResponse(503));
    const result = await fetchPageForIngestion("https://example.org/down", {
      fetchImpl,
      dnsLookupImpl: PUBLIC_DNS,
    });
    expect(result.status).toBe("broken");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry a clean 404 — a missing page won't reappear on retry", async () => {
    const fetchImpl = vi.fn(async () => makeResponse(404));
    const result = await fetchPageForIngestion("https://example.org/missing", {
      fetchImpl,
      dnsLookupImpl: PUBLIC_DNS,
    });
    expect(result.status).toBe("broken");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 403 — blocked access won't change on retry", async () => {
    const fetchImpl = vi.fn(async () => makeResponse(403));
    const result = await fetchPageForIngestion("https://example.org/forbidden", {
      fetchImpl,
      dnsLookupImpl: PUBLIC_DNS,
    });
    expect(result.status).toBe("blocked");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("times out a hanging request and still returns a classified (not thrown) result", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        })
    );
    const result = await fetchPageForIngestion("https://example.org/hangs", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      dnsLookupImpl: PUBLIC_DNS,
      timeoutMs: 20,
    });
    expect(result.status).toBe("unknown");
    expect(fetchImpl).toHaveBeenCalledTimes(2); // one retry, per the "never loop infinitely" rule
  }, 10_000);
});

import { describe, expect, it, vi } from "vitest";

import { checkUrl, isUnsafeHostname, resolvesToPrivateAddress } from "@/lib/opportunities/url-safety";

function makeResponse(status: number, headers: Record<string, string> = {}, body = ""): Response {
  return {
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => body,
  } as unknown as Response;
}

const PUBLIC_DNS = vi.fn(async () => ({ address: "93.184.216.34", family: 4 }));

describe("isUnsafeHostname", () => {
  it("flags localhost and .local hostnames", () => {
    expect(isUnsafeHostname("localhost")).toBe(true);
    expect(isUnsafeHostname("printer.local")).toBe(true);
  });

  it("flags loopback, RFC1918, and link-local IPv4 literals", () => {
    expect(isUnsafeHostname("127.0.0.1")).toBe(true);
    expect(isUnsafeHostname("10.1.2.3")).toBe(true);
    expect(isUnsafeHostname("172.16.0.5")).toBe(true);
    expect(isUnsafeHostname("192.168.1.1")).toBe(true);
    expect(isUnsafeHostname("169.254.169.254")).toBe(true); // cloud metadata endpoint
  });

  it("flags loopback/unique-local/link-local IPv6 literals", () => {
    expect(isUnsafeHostname("::1")).toBe(true);
    expect(isUnsafeHostname("fc00::1")).toBe(true);
    expect(isUnsafeHostname("fe80::1")).toBe(true);
  });

  it("allows a public IPv4 literal", () => {
    expect(isUnsafeHostname("93.184.216.34")).toBe(false);
  });
});

describe("resolvesToPrivateAddress", () => {
  it("uses the injected DNS lookup and rejects a hostname resolving to a private address", async () => {
    const dns = vi.fn(async () => ({ address: "127.0.0.1", family: 4 }));
    expect(await resolvesToPrivateAddress("evil.example", dns)).toBe(true);
  });

  it("allows a hostname resolving to a public address", async () => {
    expect(await resolvesToPrivateAddress("example.com", PUBLIC_DNS)).toBe(false);
  });

  it("fails closed when DNS resolution throws", async () => {
    const dns = vi.fn(async () => {
      throw new Error("ENOTFOUND");
    });
    expect(await resolvesToPrivateAddress("nonexistent.example", dns)).toBe(true);
  });
});

describe("checkUrl", () => {
  it("blocks a non-http(s) protocol without ever calling fetch", async () => {
    const fetchImpl = vi.fn();
    const result = await checkUrl("javascript:alert(1)", { fetchImpl, dnsLookupImpl: PUBLIC_DNS });
    expect(result.status).toBe("blocked");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("blocks a literal private-network URL without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const result = await checkUrl("http://127.0.0.1/admin", { fetchImpl });
    expect(result.status).toBe("blocked");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("blocks a hostname that resolves to a private address (DNS rebinding)", async () => {
    const fetchImpl = vi.fn();
    const dns = vi.fn(async () => ({ address: "10.0.0.5", family: 4 }));
    const result = await checkUrl("http://looks-public.example/", { fetchImpl, dnsLookupImpl: dns });
    expect(result.status).toBe("blocked");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("classifies a 200 response as working and reads the body when requested", async () => {
    const fetchImpl = vi.fn(async () => makeResponse(200, {}, "<html>ok</html>"));
    const result = await checkUrl("https://example.org/page", {
      fetchImpl,
      dnsLookupImpl: PUBLIC_DNS,
      readBody: true,
    });
    expect(result.status).toBe("working");
    expect(result.body).toBe("<html>ok</html>");
  });

  it("follows a redirect and revalidates the new hop before classifying", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(301, { location: "https://example.org/new-page" }))
      .mockResolvedValueOnce(makeResponse(200, {}, "final"));
    const result = await checkUrl("https://example.org/old-page", { fetchImpl, dnsLookupImpl: PUBLIC_DNS });
    expect(result.status).toBe("redirected");
    expect(result.finalUrl).toBe("https://example.org/new-page");
  });

  it("blocks when a redirect points at a private address", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(302, { location: "http://169.254.169.254/latest/meta-data" }));
    const result = await checkUrl("https://example.org/redirect-me", {
      fetchImpl,
      dnsLookupImpl: PUBLIC_DNS,
    });
    expect(result.status).toBe("blocked");
  });

  it("gives up after the redirect limit", async () => {
    const fetchImpl = vi.fn(async () => makeResponse(302, { location: "https://example.org/next" }));
    const result = await checkUrl("https://example.org/loop", {
      fetchImpl,
      dnsLookupImpl: PUBLIC_DNS,
      maxRedirects: 2,
    });
    expect(result.status).toBe("broken");
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(4); // never loops indefinitely
  });

  it("classifies 403/429 as blocked", async () => {
    const forbidden = await checkUrl("https://example.org/forbidden", {
      fetchImpl: vi.fn(async () => makeResponse(403)),
      dnsLookupImpl: PUBLIC_DNS,
    });
    expect(forbidden.status).toBe("blocked");

    const rateLimited = await checkUrl("https://example.org/rate-limited", {
      fetchImpl: vi.fn(async () => makeResponse(429)),
      dnsLookupImpl: PUBLIC_DNS,
    });
    expect(rateLimited.status).toBe("blocked");
  });

  it("classifies 404/500 as broken", async () => {
    const notFound = await checkUrl("https://example.org/missing", {
      fetchImpl: vi.fn(async () => makeResponse(404)),
      dnsLookupImpl: PUBLIC_DNS,
    });
    expect(notFound.status).toBe("broken");

    const serverError = await checkUrl("https://example.org/error", {
      fetchImpl: vi.fn(async () => makeResponse(500)),
      dnsLookupImpl: PUBLIC_DNS,
    });
    expect(serverError.status).toBe("broken");
  });

  it("classifies a network error/timeout as unknown", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network error");
    });
    const result = await checkUrl("https://example.org/unreachable", { fetchImpl, dnsLookupImpl: PUBLIC_DNS });
    expect(result.status).toBe("unknown");
  });
});

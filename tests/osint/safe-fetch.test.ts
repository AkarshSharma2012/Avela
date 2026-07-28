import { beforeEach, describe, expect, it } from "vitest";

import { clearRobotsCacheForTests } from "@/lib/osint/robots";
import { resetDomainLimitsForTests } from "@/lib/osint/rate-limit";
import { safeFetch } from "@/lib/osint/safe-fetch";

function makeResponse(options: { status?: number; headers?: Record<string, string>; body?: string }): Response {
  const headers = options.headers ?? {};
  const bodyText = options.body ?? "";
  const status = options.status ?? 200;
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(bodyText));
        controller.close();
      },
    }),
    text: async () => bodyText,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

beforeEach(() => {
  clearRobotsCacheForTests();
  resetDomainLimitsForTests();
});

describe("safeFetch — SSRF / private-address blocking", () => {
  it("blocks a literal private IPv4 address without ever calling fetchImpl", async () => {
    const fetchImpl = async () => {
      throw new Error("fetchImpl should never be called for a blocked address");
    };
    const result = await safeFetch("https://192.168.1.5/admin", { fetchImpl, respectRobots: false });
    expect(result.status).toBe("blocked_private_address");
  });

  it("blocks the cloud-metadata address", async () => {
    const fetchImpl = async () => {
      throw new Error("fetchImpl should never be called for a blocked address");
    };
    const result = await safeFetch("http://169.254.169.254/latest/meta-data", { fetchImpl, respectRobots: false });
    expect(result.status).toBe("blocked_private_address");
  });

  it("blocks a hostname that DNS-rebinds to a private address", async () => {
    const fetchImpl = async () => {
      throw new Error("fetchImpl should never be called for a blocked address");
    };
    const dnsLookupImpl = async () => ({ address: "127.0.0.1", family: 4 });
    const result = await safeFetch("https://looks-public.example.com/", { fetchImpl, dnsLookupImpl, respectRobots: false });
    expect(result.status).toBe("blocked_private_address");
  });

  it("blocks non-http(s) protocols like file://", async () => {
    const result = await safeFetch("file:///etc/passwd", { respectRobots: false });
    expect(result.status).toBe("blocked_protocol");
  });
});

describe("safeFetch — redirect limits", () => {
  it("stops following after maxRedirects hops", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return makeResponse({ status: 302, headers: { location: "https://example.com/next" } });
    };
    const dnsLookupImpl = async () => ({ address: "93.184.216.34", family: 4 });
    const result = await safeFetch("https://example.com/start", { fetchImpl, dnsLookupImpl, maxRedirects: 2, respectRobots: false });
    expect(result.status).toBe("redirect_limit_exceeded");
    expect(calls).toBe(3); // initial + 2 redirects
  });
});

describe("safeFetch — response-size limits", () => {
  it("rejects based on a declared content-length over the cap", async () => {
    const fetchImpl = async () =>
      makeResponse({ status: 200, headers: { "content-type": "text/html", "content-length": "999999999" } });
    const dnsLookupImpl = async () => ({ address: "93.184.216.34", family: 4 });
    const result = await safeFetch("https://example.com/huge", { fetchImpl, dnsLookupImpl, maxBytes: 1000, respectRobots: false });
    expect(result.status).toBe("response_too_large");
  });

  it("rejects a body that exceeds the cap even without a content-length header", async () => {
    const fetchImpl = async () => makeResponse({ status: 200, headers: { "content-type": "text/html" }, body: "x".repeat(5000) });
    const dnsLookupImpl = async () => ({ address: "93.184.216.34", family: 4 });
    const result = await safeFetch("https://example.com/huge-stream", { fetchImpl, dnsLookupImpl, maxBytes: 100, respectRobots: false });
    expect(result.status).toBe("response_too_large");
  });
});

describe("safeFetch — timeout behavior", () => {
  it("returns a timeout status when the request never resolves in time", async () => {
    const fetchImpl = (_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    const dnsLookupImpl = async () => ({ address: "93.184.216.34", family: 4 });
    const result = await safeFetch("https://example.com/slow", { fetchImpl, dnsLookupImpl, timeoutMs: 20, respectRobots: false });
    expect(result.status).toBe("timeout");
  });
});

describe("safeFetch — content-type allowlist", () => {
  it("blocks a disallowed content type", async () => {
    const fetchImpl = async () => makeResponse({ status: 200, headers: { "content-type": "application/pdf" }, body: "%PDF-1.4" });
    const dnsLookupImpl = async () => ({ address: "93.184.216.34", family: 4 });
    const result = await safeFetch("https://example.com/file.pdf", { fetchImpl, dnsLookupImpl, respectRobots: false });
    expect(result.status).toBe("blocked_content_type");
  });

  it("allows text/html", async () => {
    const fetchImpl = async () => makeResponse({ status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: "<html>hi</html>" });
    const dnsLookupImpl = async () => ({ address: "93.184.216.34", family: 4 });
    const result = await safeFetch("https://example.com/page", { fetchImpl, dnsLookupImpl, respectRobots: false });
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.body).toBe("<html>hi</html>");
  });
});

describe("safeFetch — robots.txt compliance", () => {
  it("blocks a path disallowed by robots.txt", async () => {
    const fetchImpl = async (url: RequestInfo | URL) => {
      if (String(url).endsWith("/robots.txt")) return makeResponse({ status: 200, body: "User-agent: *\nDisallow: /private\n" });
      return makeResponse({ status: 200, headers: { "content-type": "text/html" }, body: "<html>secret</html>" });
    };
    const dnsLookupImpl = async () => ({ address: "93.184.216.34", family: 4 });
    const result = await safeFetch("https://example.com/private/page", { fetchImpl, dnsLookupImpl });
    expect(result.status).toBe("blocked_robots");
  });

  it("allows a path robots.txt does not disallow", async () => {
    const fetchImpl = async (url: RequestInfo | URL) => {
      if (String(url).endsWith("/robots.txt")) return makeResponse({ status: 200, body: "User-agent: *\nDisallow: /private\n" });
      return makeResponse({ status: 200, headers: { "content-type": "text/html" }, body: "<html>public</html>" });
    };
    const dnsLookupImpl = async () => ({ address: "93.184.216.34", family: 4 });
    const result = await safeFetch("https://example.com/public/page", { fetchImpl, dnsLookupImpl });
    expect(result.status).toBe("ok");
  });

  it("fails open (allows) when robots.txt itself can't be fetched", async () => {
    const fetchImpl = async (url: RequestInfo | URL) => {
      if (String(url).endsWith("/robots.txt")) throw new Error("network error");
      return makeResponse({ status: 200, headers: { "content-type": "text/html" }, body: "<html>ok</html>" });
    };
    const dnsLookupImpl = async () => ({ address: "93.184.216.34", family: 4 });
    const result = await safeFetch("https://example.com/anything", { fetchImpl, dnsLookupImpl });
    expect(result.status).toBe("ok");
  });
});

describe("safeFetch — HTTP errors", () => {
  it("classifies a 404 as http_error", async () => {
    const fetchImpl = async () => makeResponse({ status: 404 });
    const dnsLookupImpl = async () => ({ address: "93.184.216.34", family: 4 });
    const result = await safeFetch("https://example.com/missing", { fetchImpl, dnsLookupImpl, respectRobots: false });
    expect(result.status).toBe("http_error");
  });
});

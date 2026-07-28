/**
 * Server-only safe fetch layer for the OSINT engine (spec section 8).
 * Deliberately not a general-purpose scraper: every call goes through
 * SSRF protection, robots.txt, per-domain rate limiting, a content-type
 * allowlist, a response-size cap, and a redirect cap, and every failure
 * mode is returned as a classified status rather than thrown — connectors
 * treat a blocked/failed fetch as "no evidence from this source," never as
 * an unhandled exception that could take the rest of the check down with
 * it (spec section 1: "fail independently").
 *
 * Reuses the SSRF/private-address checks already proven out for the
 * opportunity-ingestion crawler (src/lib/opportunities/url-safety.ts)
 * rather than re-implementing DNS-rebinding defenses a second time.
 */

import type { DnsLookupFn } from "@/lib/opportunities/url-safety";
import { resolvesToPrivateAddress } from "@/lib/opportunities/url-safety";
import { ALLOWED_CONTENT_TYPES, FETCH_TIMEOUT_MS, MAX_REDIRECTS, MAX_RESPONSE_BYTES, OSINT_USER_AGENT } from "@/lib/osint/constants";
import { withDomainLimit } from "@/lib/osint/rate-limit";
import { robotsAllows } from "@/lib/osint/robots";

export type SafeFetchStatus =
  | "ok"
  | "blocked_protocol"
  | "blocked_private_address"
  | "blocked_robots"
  | "blocked_rate_limit"
  | "blocked_content_type"
  | "response_too_large"
  | "redirect_limit_exceeded"
  | "timeout"
  | "http_error"
  | "network_error";

export type SafeFetchResult =
  | { status: "ok"; finalUrl: string; statusCode: number; contentType: string; body: string }
  | { status: Exclude<SafeFetchStatus, "ok">; finalUrl: string; statusCode: number | null };

export type SafeFetchOptions = {
  fetchImpl?: typeof fetch;
  dnsLookupImpl?: DnsLookupFn;
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  allowedContentTypes?: readonly string[];
  /** Only ever set true for a source the student directly consented to and supplied (the claim's own official URL) where robots.txt would otherwise block a single-page, student-initiated lookup a browser could do anyway — still every other protection stays on. */
  skipRobotsCheck?: boolean;
  respectRobots?: boolean;
};

async function readBodyWithLimit(response: Response, maxBytes: number): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return await response.text();

  const chunks: Uint8Array[] = [];
  let total = 0;
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  }
  return chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join("") + decoder.decode();
}

/** Fetches one URL under every safety constraint in spec section 8. Never follows a redirect to an unsafe address, never reads past the byte cap, never ignores robots.txt for a discovered (non-claim) URL. */
export async function safeFetch(url: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  const maxBytes = options.maxBytes ?? MAX_RESPONSE_BYTES;
  const allowedContentTypes = options.allowedContentTypes ?? ALLOWED_CONTENT_TYPES;
  const respectRobots = options.respectRobots ?? !options.skipRobotsCheck;

  let currentUrl = url;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(currentUrl);
    } catch {
      return { status: "network_error", finalUrl: currentUrl, statusCode: null };
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { status: "blocked_protocol", finalUrl: currentUrl, statusCode: null };
    }

    if (await resolvesToPrivateAddress(parsed.hostname, options.dnsLookupImpl)) {
      return { status: "blocked_private_address", finalUrl: currentUrl, statusCode: null };
    }

    if (respectRobots) {
      const allowed = await robotsAllows(currentUrl, OSINT_USER_AGENT, { fetchImpl });
      if (!allowed) return { status: "blocked_robots", finalUrl: currentUrl, statusCode: null };
    }

    let response: Response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await withDomainLimit(parsed.hostname.toLowerCase(), () =>
        fetchImpl(currentUrl, {
          method: "GET",
          redirect: "manual",
          headers: { "User-Agent": OSINT_USER_AGENT, Accept: allowedContentTypes.join(", ") },
          signal: controller.signal,
        })
      );
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "DomainRateLimitError") {
        return { status: "blocked_rate_limit", finalUrl: currentUrl, statusCode: null };
      }
      if (err instanceof Error && err.name === "AbortError") {
        return { status: "timeout", finalUrl: currentUrl, statusCode: null };
      }
      return { status: "network_error", finalUrl: currentUrl, statusCode: null };
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { status: "http_error", finalUrl: currentUrl, statusCode: response.status };
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (response.status >= 400) {
      return { status: "http_error", finalUrl: currentUrl, statusCode: response.status };
    }

    const contentType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
    if (!allowedContentTypes.some((allowed) => contentType === allowed)) {
      return { status: "blocked_content_type", finalUrl: currentUrl, statusCode: response.status };
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > maxBytes) {
      return { status: "response_too_large", finalUrl: currentUrl, statusCode: response.status };
    }

    const body = await readBodyWithLimit(response, maxBytes);
    if (body === null) {
      return { status: "response_too_large", finalUrl: currentUrl, statusCode: response.status };
    }

    return { status: "ok", finalUrl: currentUrl, statusCode: response.status, contentType, body };
  }

  return { status: "redirect_limit_exceeded", finalUrl: currentUrl, statusCode: null };
}

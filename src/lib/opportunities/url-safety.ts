import { lookup } from "node:dns/promises";

/**
 * Server-only (uses `node:dns`). Never import this from a client
 * component — it exists to safely fetch *source* URLs during ingestion,
 * never a URL a student supplies (see spec: "Do not fetch arbitrary URLs
 * supplied by students").
 */

export type UrlCheckStatus = "working" | "redirected" | "broken" | "blocked" | "unknown";

export type UrlCheckResult = {
  status: UrlCheckStatus;
  finalUrl: string;
  statusCode: number | null;
  /** Only populated when `readBody` was requested and the fetch actually succeeded. */
  body: string | null;
};

const PRIVATE_HOSTNAMES = new Set(["localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback"]);

function isIpv4Literal(hostname: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return true; // malformed address — fail closed
  }
  const [a, b] = parts;
  if (a === 127) return true; // loopback
  if (a === 10) return true; // RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 169 && b === 254) return true; // link-local / cloud metadata (169.254.169.254)
  if (a === 0) return true;
  return false;
}

function isPrivateIpv6(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "::1" || host === "::") return true;
  if (host.startsWith("fc") || host.startsWith("fd")) return true; // unique local fc00::/7
  if (host.startsWith("fe80")) return true; // link-local
  return false;
}

/** Checks a literal hostname/IP string — does not resolve DNS. */
export function isUnsafeHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (PRIVATE_HOSTNAMES.has(lower)) return true;
  if (lower.endsWith(".local")) return true;
  if (isIpv4Literal(lower)) return isPrivateIpv4(lower);
  if (lower.includes(":")) return isPrivateIpv6(lower);
  return false;
}

export type DnsLookupFn = (hostname: string) => Promise<{ address: string; family: number }>;

/**
 * Resolves a hostname and checks whether it lands on a private/loopback/
 * link-local address — defends against DNS rebinding (a hostname that
 * looks public but resolves to an internal address). A hostname that
 * fails to resolve is treated as unsafe (fail closed), not "unknown".
 * `dnsLookupImpl` is injectable so tests never perform a real DNS lookup.
 */
export async function resolvesToPrivateAddress(
  hostname: string,
  dnsLookupImpl: DnsLookupFn = lookup
): Promise<boolean> {
  if (isIpv4Literal(hostname) || hostname.includes(":")) return isUnsafeHostname(hostname);
  try {
    const { address } = await dnsLookupImpl(hostname);
    return isUnsafeHostname(address);
  } catch {
    return true;
  }
}

export type FetchFn = typeof fetch;

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_REDIRECTS = 3;
export const INGESTION_USER_AGENT =
  "AvelaOpportunityBot/1.0 (+https://avela.example/bot; educational opportunity discovery)";

/**
 * Fetches a URL only if it's safe to: http(s) only, rejects any hop that
 * is a literal or DNS-resolved private/loopback/link-local address, and
 * re-validates every redirect hop the same way (a safe starting URL could
 * still redirect somewhere unsafe). Never follows more than
 * `maxRedirects` hops. Classifies the outcome instead of throwing, so
 * callers (adapters, the ingestion runner) can record "blocked"/"broken"
 * as data rather than handling exceptions.
 */
export async function checkUrl(
  url: string,
  options: {
    fetchImpl?: FetchFn;
    timeoutMs?: number;
    maxRedirects?: number;
    readBody?: boolean;
    dnsLookupImpl?: DnsLookupFn;
  } = {}
): Promise<UrlCheckResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  let currentUrl = url;
  let hasRedirected = false;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(currentUrl);
    } catch {
      return { status: "broken", finalUrl: currentUrl, statusCode: null, body: null };
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { status: "blocked", finalUrl: currentUrl, statusCode: null, body: null };
    }

    if (await resolvesToPrivateAddress(parsed.hostname, options.dnsLookupImpl)) {
      return { status: "blocked", finalUrl: currentUrl, statusCode: null, body: null };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(currentUrl, {
        method: "GET",
        redirect: "manual",
        headers: { "User-Agent": INGESTION_USER_AGENT },
        signal: controller.signal,
      });
    } catch {
      return { status: "unknown", finalUrl: currentUrl, statusCode: null, body: null };
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        return { status: "broken", finalUrl: currentUrl, statusCode: response.status, body: null };
      }
      currentUrl = new URL(location, currentUrl).toString();
      hasRedirected = true;
      continue;
    }

    if (response.status === 403 || response.status === 429) {
      return { status: "blocked", finalUrl: currentUrl, statusCode: response.status, body: null };
    }

    if (response.status >= 400) {
      return { status: "broken", finalUrl: currentUrl, statusCode: response.status, body: null };
    }

    const body = options.readBody ? await response.text() : null;
    return {
      status: hasRedirected ? "redirected" : "working",
      finalUrl: currentUrl,
      statusCode: response.status,
      body,
    };
  }

  return { status: "broken", finalUrl: currentUrl, statusCode: null, body: null };
}

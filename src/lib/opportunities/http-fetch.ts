import { checkUrl, type DnsLookupFn, type FetchFn, type UrlCheckResult } from "@/lib/opportunities/url-safety";

const DEFAULT_TIMEOUT_MS = 8_000;
/** One retry, never more — "retry only conservatively... never loop infinitely" per the spec. */
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Only transient outcomes are worth retrying — a 404 or an unsafe/blocked URL won't change on a second try. */
function isRetryable(result: UrlCheckResult): boolean {
  if (result.status === "unknown") return true; // network error or timeout
  if (result.status === "broken" && result.statusCode !== null && result.statusCode >= 500) return true;
  return false;
}

/**
 * Fetches page content for ingestion: safety-checked (see `url-safety.ts`),
 * a clear identifying User-Agent, a bounded timeout, and at most one
 * conservative retry on a transient failure. Never throws — callers get a
 * classified result and decide what to do (an adapter that can't reach its
 * source should fail safely, not crash the whole ingestion run).
 */
export async function fetchPageForIngestion(
  url: string,
  options: { fetchImpl?: FetchFn; timeoutMs?: number; dnsLookupImpl?: DnsLookupFn } = {}
): Promise<UrlCheckResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let last: UrlCheckResult = { status: "unknown", finalUrl: url, statusCode: null, body: null };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    last = await checkUrl(url, {
      fetchImpl: options.fetchImpl,
      timeoutMs,
      readBody: true,
      dnsLookupImpl: options.dnsLookupImpl,
    });
    if (!isRetryable(last) || attempt === MAX_ATTEMPTS) break;
    await sleep(RETRY_DELAY_MS);
  }
  return last;
}

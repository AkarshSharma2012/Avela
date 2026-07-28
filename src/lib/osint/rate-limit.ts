/**
 * Per-domain concurrency and request-rate limiting for safe-fetch.ts (spec
 * section 8). In-memory and per-process — on a single long-lived server
 * this evenly paces requests to any one domain; on a multi-instance
 * serverless deployment each instance paces independently, so the
 * *effective* ceiling across a fleet is `limit * instanceCount`. That's a
 * known limitation (see the final report), acceptable here because actual
 * request volume is bounded by "one student running one check," not a bulk
 * crawl — a shared store (e.g. Redis) would be the fix if this ever needs
 * to hold under real concurrent load.
 */

import { MAX_CONCURRENT_REQUESTS_PER_DOMAIN, MAX_REQUESTS_PER_DOMAIN_PER_MINUTE } from "@/lib/osint/constants";

type DomainState = { active: number; windowStart: number; countInWindow: number; queue: (() => void)[] };

const domains = new Map<string, DomainState>();
const WINDOW_MS = 60_000;

function stateFor(domain: string): DomainState {
  let state = domains.get(domain);
  if (!state) {
    state = { active: 0, windowStart: Date.now(), countInWindow: 0, queue: [] };
    domains.set(domain, state);
  }
  return state;
}

function refreshWindow(state: DomainState): void {
  const now = Date.now();
  if (now - state.windowStart >= WINDOW_MS) {
    state.windowStart = now;
    state.countInWindow = 0;
  }
}

export class DomainRateLimitError extends Error {
  constructor(domain: string) {
    super(`Rate limit exceeded for domain: ${domain}`);
    this.name = "DomainRateLimitError";
  }
}

/**
 * Runs `task` once a concurrency slot for `domain` is free, throwing
 * `DomainRateLimitError` immediately (never queuing across the per-minute
 * limit) if the domain's per-minute budget is already spent — callers
 * treat that as one more independent connector failure, never a fatal one
 * (spec section 1: "fail independently without failing the entire
 * verification").
 */
export async function withDomainLimit<T>(domain: string, task: () => Promise<T>): Promise<T> {
  const state = stateFor(domain);
  refreshWindow(state);
  if (state.countInWindow >= MAX_REQUESTS_PER_DOMAIN_PER_MINUTE) {
    throw new DomainRateLimitError(domain);
  }
  state.countInWindow++;

  if (state.active >= MAX_CONCURRENT_REQUESTS_PER_DOMAIN) {
    await new Promise<void>((resolve) => state.queue.push(resolve));
  }
  state.active++;
  try {
    return await task();
  } finally {
    state.active--;
    const next = state.queue.shift();
    if (next) next();
  }
}

/** Test-only: resets all in-memory domain rate-limit/concurrency state. */
export function resetDomainLimitsForTests(): void {
  domains.clear();
}

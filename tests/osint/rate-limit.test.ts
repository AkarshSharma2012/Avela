import { beforeEach, describe, expect, it } from "vitest";

import { DomainRateLimitError, resetDomainLimitsForTests, withDomainLimit } from "@/lib/osint/rate-limit";
import { MAX_REQUESTS_PER_DOMAIN_PER_MINUTE } from "@/lib/osint/constants";

beforeEach(() => {
  resetDomainLimitsForTests();
});

describe("withDomainLimit — per-domain rate limiting", () => {
  it("allows requests up to the per-minute budget", async () => {
    for (let i = 0; i < MAX_REQUESTS_PER_DOMAIN_PER_MINUTE; i++) {
      await expect(withDomainLimit("example.com", async () => "ok")).resolves.toBe("ok");
    }
  });

  it("throws DomainRateLimitError once the per-minute budget is exceeded", async () => {
    for (let i = 0; i < MAX_REQUESTS_PER_DOMAIN_PER_MINUTE; i++) {
      await withDomainLimit("example.com", async () => "ok");
    }
    await expect(withDomainLimit("example.com", async () => "ok")).rejects.toBeInstanceOf(DomainRateLimitError);
  });

  it("tracks each domain independently", async () => {
    for (let i = 0; i < MAX_REQUESTS_PER_DOMAIN_PER_MINUTE; i++) {
      await withDomainLimit("example.com", async () => "ok");
    }
    await expect(withDomainLimit("another-example.com", async () => "ok")).resolves.toBe("ok");
  });
});

describe("withDomainLimit — per-domain concurrency", () => {
  it("runs concurrent calls to the same domain without deadlocking, respecting the concurrency cap", async () => {
    let active = 0;
    let maxActive = 0;
    const task = () =>
      withDomainLimit("busy.example.com", async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        return "done";
      });
    const results = await Promise.all([task(), task(), task(), task()]);
    expect(results).toEqual(["done", "done", "done", "done"]);
    expect(maxActive).toBeLessThanOrEqual(2); // MAX_CONCURRENT_REQUESTS_PER_DOMAIN
  });
});

import { describe, expect, it } from "vitest";

import { currentWindowStart, RATE_LIMITS } from "@/lib/integrity/rate-limit";

describe("currentWindowStart", () => {
  it("is stable for two timestamps in the same fixed window", () => {
    const bucket = "verifier_response"; // 1-hour window
    const a = currentWindowStart(bucket, new Date("2026-01-01T10:05:00Z"));
    const b = currentWindowStart(bucket, new Date("2026-01-01T10:55:00Z"));
    expect(a).toBe(b);
  });

  it("differs across a window boundary", () => {
    const bucket = "verifier_response";
    const a = currentWindowStart(bucket, new Date("2026-01-01T10:59:59Z"));
    const b = currentWindowStart(bucket, new Date("2026-01-01T11:00:01Z"));
    expect(a).not.toBe(b);
  });

  it("uses each bucket's own configured window length", () => {
    expect(RATE_LIMITS.verification_request.windowSeconds).toBe(60 * 60 * 24);
    expect(RATE_LIMITS.verifier_response.windowSeconds).toBe(60 * 60);
  });
});

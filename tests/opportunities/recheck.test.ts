import { describe, expect, it } from "vitest";

import { computeNextVerificationAt } from "@/lib/opportunities/recheck";

const NOW = new Date("2026-07-26T12:00:00Z");
const DAY_MS = 86_400_000;

describe("computeNextVerificationAt", () => {
  it("schedules daily rechecks when the deadline is within 14 days", () => {
    const deadline = new Date(NOW.getTime() + 10 * DAY_MS).toISOString();
    const next = computeNextVerificationAt("open", deadline, NOW);
    expect(next.getTime()).toBe(NOW.getTime() + 1 * DAY_MS);
  });

  it("schedules every-3-days rechecks when the deadline is within 60 days", () => {
    const deadline = new Date(NOW.getTime() + 40 * DAY_MS).toISOString();
    const next = computeNextVerificationAt("open", deadline, NOW);
    expect(next.getTime()).toBe(NOW.getTime() + 3 * DAY_MS);
  });

  it("schedules monthly rechecks for a far-future deadline", () => {
    const deadline = new Date(NOW.getTime() + 200 * DAY_MS).toISOString();
    const next = computeNextVerificationAt("open", deadline, NOW);
    expect(next.getTime()).toBe(NOW.getTime() + 30 * DAY_MS);
  });

  it("schedules weekly rechecks for rolling opportunities", () => {
    const next = computeNextVerificationAt("rolling", null, NOW);
    expect(next.getTime()).toBe(NOW.getTime() + 7 * DAY_MS);
  });

  it("schedules weekly rechecks for unknown deadlines", () => {
    const next = computeNextVerificationAt("unknown", null, NOW);
    expect(next.getTime()).toBe(NOW.getTime() + 7 * DAY_MS);
  });

  it("schedules monthly rechecks for upcoming (not-yet-open) opportunities", () => {
    const next = computeNextVerificationAt("upcoming", null, NOW);
    expect(next.getTime()).toBe(NOW.getTime() + 30 * DAY_MS);
  });

  it("schedules infrequent (quarterly) rechecks for closed opportunities", () => {
    const next = computeNextVerificationAt("closed", "2026-01-01T00:00:00Z", NOW);
    expect(next.getTime()).toBe(NOW.getTime() + 90 * DAY_MS);
  });

  it("is a boundary right at the 14-day cutoff", () => {
    const deadline = new Date(NOW.getTime() + 14 * DAY_MS).toISOString();
    const next = computeNextVerificationAt("open", deadline, NOW);
    expect(next.getTime()).toBe(NOW.getTime() + 1 * DAY_MS);
  });
});

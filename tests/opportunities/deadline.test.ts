import { describe, expect, it } from "vitest";

import { evaluateDeadline, isDefinitivelyExpired } from "@/lib/opportunities/deadline";

const NOW = new Date("2026-07-26T12:00:00Z");

describe("evaluateDeadline", () => {
  it("classifies an exact future deadline as open", () => {
    const result = evaluateDeadline({ applicationDeadline: "2026-08-01T00:00:00Z" }, NOW);
    expect(result.status).toBe("open");
  });

  it("classifies rolling admissions distinctly from unknown", () => {
    const result = evaluateDeadline(
      { applicationDeadline: null, isRollingAdmission: true },
      NOW
    );
    expect(result.status).toBe("rolling");
  });

  it("classifies a not-yet-open application window as upcoming", () => {
    const result = evaluateDeadline(
      { applicationDeadline: "2026-09-01T00:00:00Z", applicationOpensAt: "2026-08-15T00:00:00Z" },
      NOW
    );
    expect(result.status).toBe("upcoming");
  });

  it("classifies a passed exact deadline as closed", () => {
    const result = evaluateDeadline({ applicationDeadline: "2026-01-01T00:00:00Z" }, NOW);
    expect(result.status).toBe("closed");
  });

  it("classifies a recurring program with a stale prior-year deadline as unknown, not closed", () => {
    const result = evaluateDeadline(
      { applicationDeadline: "2025-03-15T00:00:00Z", recurrencePattern: "annual" },
      NOW
    );
    expect(result.status).toBe("unknown");
    expect(result.reason).toMatch(/previous cycle/i);
  });

  it("classifies a recurring program whose deadline already passed *this* year as closed, not stale", () => {
    const result = evaluateDeadline(
      { applicationDeadline: "2026-03-15T00:00:00Z", recurrencePattern: "annual" },
      NOW
    );
    expect(result.status).toBe("closed");
  });

  it("classifies no known deadline as unknown", () => {
    const result = evaluateDeadline({ applicationDeadline: null }, NOW);
    expect(result.status).toBe("unknown");
  });

  it("treats a deadline at the exact current instant as still open (boundary)", () => {
    const result = evaluateDeadline({ applicationDeadline: NOW.toISOString() }, NOW);
    expect(result.status).toBe("open");
  });

  it("treats one millisecond past the deadline as closed (boundary)", () => {
    const justPassed = new Date(NOW.getTime() - 1);
    const result = evaluateDeadline({ applicationDeadline: justPassed.toISOString() }, NOW);
    expect(result.status).toBe("closed");
  });

  it("is timezone-safe: a deadline given in a non-UTC offset compares correctly against UTC now", () => {
    // 2026-07-26T23:00:00-05:00 == 2026-07-27T04:00:00Z, which is after NOW.
    const result = evaluateDeadline({ applicationDeadline: "2026-07-26T23:00:00-05:00" }, NOW);
    expect(result.status).toBe("open");
  });
});

describe("isDefinitivelyExpired", () => {
  it("is true only for closed", () => {
    expect(isDefinitivelyExpired({ status: "closed", reason: "" })).toBe(true);
    expect(isDefinitivelyExpired({ status: "unknown", reason: "" })).toBe(false);
    expect(isDefinitivelyExpired({ status: "rolling", reason: "" })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import {
  formatCommitment,
  formatCost,
  formatDateRange,
  formatDeadline,
  formatGradeRange,
  formatLastVerified,
  formatLocation,
  isClosingSoon,
  isDeadlinePassed,
} from "@/lib/opportunities/format";

const NOW = new Date("2026-07-26T12:00:00Z");

describe("formatGradeRange", () => {
  it("reports all grades when both bounds are null", () => {
    expect(formatGradeRange(null, null)).toBe("All grades");
  });

  it("reports an open lower bound", () => {
    expect(formatGradeRange(null, 12)).toBe("Up to grade 12");
  });

  it("reports an open upper bound", () => {
    expect(formatGradeRange(9, null)).toBe("Grade 9+");
  });

  it("collapses an equal min/max to a single grade", () => {
    expect(formatGradeRange(10, 10)).toBe("Grade 10");
  });

  it("reports a full range", () => {
    expect(formatGradeRange(9, 12)).toBe("Grades 9–12");
  });
});

describe("formatCost", () => {
  it("reports Free regardless of amount", () => {
    expect(formatCost("free", null)).toBe("Free");
    expect(formatCost("free", 0)).toBe("Free");
  });

  it("reports Paid with no amount", () => {
    expect(formatCost("paid", null)).toBe("Paid");
  });

  it("formats a whole-dollar amount without decimals", () => {
    expect(formatCost("paid", 450)).toBe("$450");
  });

  it("formats a fractional amount with two decimals", () => {
    expect(formatCost("paid", 49.5)).toBe("$49.50");
  });
});

describe("isDeadlinePassed / formatDeadline", () => {
  it("treats a null deadline as never passed / rolling admissions", () => {
    expect(isDeadlinePassed(null, NOW)).toBe(false);
    expect(formatDeadline(null, NOW)).toBe("Rolling admissions");
  });

  it("reports a future deadline as due, not passed", () => {
    expect(isDeadlinePassed("2027-01-15T23:59:00Z", NOW)).toBe(false);
    expect(formatDeadline("2027-01-15T23:59:00Z", NOW)).toBe("Applications due Jan 15, 2027");
  });

  it("reports a past deadline as passed", () => {
    expect(isDeadlinePassed("2026-06-01T23:59:00Z", NOW)).toBe(true);
    expect(formatDeadline("2026-06-01T23:59:00Z", NOW)).toBe("Deadline passed");
  });
});

describe("isClosingSoon", () => {
  it("is never closing soon with no deadline (rolling admissions)", () => {
    expect(isClosingSoon(null, NOW)).toBe(false);
  });

  it("is closing soon within the default 14-day threshold", () => {
    expect(isClosingSoon("2026-08-05T00:00:00Z", NOW)).toBe(true);
  });

  it("is not closing soon well beyond the threshold", () => {
    expect(isClosingSoon("2027-01-15T00:00:00Z", NOW)).toBe(false);
  });

  it("is not closing soon once the deadline has already passed", () => {
    expect(isClosingSoon("2026-06-01T00:00:00Z", NOW)).toBe(false);
  });

  it("respects a custom threshold", () => {
    expect(isClosingSoon("2026-08-05T00:00:00Z", NOW, 3)).toBe(false);
    expect(isClosingSoon("2026-07-27T00:00:00Z", NOW, 3)).toBe(true);
  });
});

describe("formatCommitment", () => {
  it("combines hours and duration when both are set", () => {
    expect(formatCommitment(6, "Academic-year mentored research")).toBe(
      "6 hrs/week · Academic-year mentored research"
    );
  });

  it("falls back to just hours when duration is unset", () => {
    expect(formatCommitment(4, null)).toBe("4 hrs/week");
  });

  it("falls back to just duration when hours are unset", () => {
    expect(formatCommitment(null, "One-time application")).toBe("One-time application");
  });

  it("reports a generic message when neither is set", () => {
    expect(formatCommitment(null, null)).toBe("Commitment varies");
  });
});

describe("formatLocation", () => {
  it("combines a location with a remote option", () => {
    expect(formatLocation("Boston, MA", true)).toBe("Boston, MA (remote option)");
  });

  it("reports just the location when remote isn't allowed", () => {
    expect(formatLocation("Boston, MA", false)).toBe("Boston, MA");
  });

  it("reports Remote when there's no location text", () => {
    expect(formatLocation(null, true)).toBe("Remote");
  });

  it("reports unspecified when neither is set", () => {
    expect(formatLocation(null, false)).toBe("Location not specified");
  });
});

describe("formatLastVerified", () => {
  it("reports not-yet-checked when null", () => {
    expect(formatLastVerified(null)).toBe("Not yet checked");
  });

  it("reports the last-checked date", () => {
    expect(formatLastVerified("2026-07-20T00:00:00Z")).toBe("Last checked Jul 20, 2026");
  });
});

describe("formatDateRange", () => {
  it("combines a start and end date", () => {
    expect(formatDateRange("2027-06-20", "2027-08-01")).toBe("Jun 20, 2027 – Aug 1, 2027");
  });

  it("reports just a start date", () => {
    expect(formatDateRange("2027-06-20", null)).toBe("Starts Jun 20, 2027");
  });

  it("reports just an end date", () => {
    expect(formatDateRange(null, "2027-08-01")).toBe("Ends Aug 1, 2027");
  });

  it("returns null when neither is set", () => {
    expect(formatDateRange(null, null)).toBeNull();
  });
});

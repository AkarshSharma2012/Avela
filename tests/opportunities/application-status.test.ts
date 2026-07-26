import { describe, expect, it } from "vitest";

import { detectApplicationStatus } from "@/lib/opportunities/application-status";

describe("detectApplicationStatus", () => {
  it("detects an explicit closed statement", () => {
    const result = detectApplicationStatus("Applications are currently closed for this cycle.");
    expect(result.status).toBe("closed");
    expect(result.evidence).toContain("closed");
  });

  it("detects rolling admissions", () => {
    const result = detectApplicationStatus("This program accepts applications on a rolling basis.");
    expect(result.status).toBe("accepting_applications");
    expect(result.isRolling).toBe(true);
  });

  it("detects an explicit open statement and a close date together", () => {
    const result = detectApplicationStatus("Applications are now open. Applications close on March 15, 2027.");
    expect(result.status).toBe("accepting_applications");
    expect(result.closesAt).toBe(new Date(Date.UTC(2027, 2, 15)).toISOString());
  });

  it("detects an extended deadline as still accepting applications", () => {
    const result = detectApplicationStatus("The deadline has been extended to April 1, 2027.");
    expect(result.status).toBe("accepting_applications");
  });

  it("detects a next-cycle-announced signal", () => {
    const result = detectApplicationStatus("The next application cycle opens in November.");
    expect(result.status).toBe("opening_soon");
    expect(result.isNextCycleAnnounced).toBe(true);
  });

  it("detects an opens-at date without an explicit next-cycle phrase", () => {
    const result = detectApplicationStatus("Applications open on November 1, 2026.");
    expect(result.status).toBe("opening_soon");
    expect(result.opensAt).toBe(new Date(Date.UTC(2026, 10, 1)).toISOString());
  });

  it("an explicit closed statement wins even if the page also has an Apply link callout in the same text", () => {
    // Text only — this function never receives HTML/links, so an "Apply
    // Now" callout elsewhere on the page can never register here at all.
    const result = detectApplicationStatus("Apply Now! Note: applications are currently closed.");
    expect(result.status).toBe("closed");
  });

  it("never reports 'open' merely because generic apply-related words exist without a real status phrase", () => {
    const result = detectApplicationStatus("Learn about our application process and program history.");
    expect(result.status).toBe("unknown");
  });

  it("reports unknown with a closesAt when only a due-date phrase exists, no open/closed/rolling phrase", () => {
    const result = detectApplicationStatus("Applications due March 15, 2027.");
    expect(result.status).toBe("unknown");
    expect(result.closesAt).toBe(new Date(Date.UTC(2027, 2, 15)).toISOString());
  });

  it("returns fully unknown with no evidence when nothing matches at all", () => {
    const result = detectApplicationStatus("This is a general description with no status information.");
    expect(result.status).toBe("unknown");
    expect(result.evidence).toBe("");
    expect(result.confidence).toBe(0);
  });
});

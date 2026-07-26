import { describe, expect, it } from "vitest";

import { formatReviewQueueEntry, parseReviewAction } from "@/lib/opportunities/review-cli";

describe("parseReviewAction", () => {
  it("parses --mark-reviewed=<id>", () => {
    expect(parseReviewAction(["--mark-reviewed=abc-123"])).toEqual({
      kind: "mark-reviewed",
      reviewId: "abc-123",
    });
  });

  it("parses --reject=<id>", () => {
    expect(parseReviewAction(["--reject=abc-123"])).toEqual({ kind: "reject", reviewId: "abc-123" });
  });

  it("parses --recheck=<id>", () => {
    expect(parseReviewAction(["--recheck=abc-123"])).toEqual({ kind: "recheck", reviewId: "abc-123" });
  });

  it("returns null when no action flag is present — the CLI lists instead", () => {
    expect(parseReviewAction(["--dry-run"])).toBeNull();
    expect(parseReviewAction([])).toBeNull();
  });

  it("never accepts an arbitrary field/value pair — only one of the three fixed flags", () => {
    expect(parseReviewAction(["--set-field=title", "--value=Hacked"])).toBeNull();
  });
});

describe("formatReviewQueueEntry", () => {
  it("includes title, source, reasons, last-checked, and a suggested action", () => {
    const output = formatReviewQueueEntry({
      reviewId: "rq-1",
      opportunityTitle: "Test Program",
      sourceName: "Test Source",
      reasons: ["unknown_deadline"],
      lastCheckedAt: "2026-06-01T00:00:00Z",
      createdAt: "2026-06-15T00:00:00Z",
    });

    expect(output).toContain("Test Program");
    expect(output).toContain("Test Source");
    expect(output).toContain("unknown_deadline");
    expect(output).toContain("2026-06-01");
    expect(output.toLowerCase()).toContain("recheck");
  });

  it("falls back to placeholder text when title/source are unknown", () => {
    const output = formatReviewQueueEntry({
      reviewId: "rq-2",
      opportunityTitle: null,
      sourceName: null,
      reasons: ["probable_duplicate"],
      lastCheckedAt: null,
      createdAt: "2026-06-15T00:00:00Z",
    });

    expect(output).toContain("Unknown source");
    expect(output).toContain("never");
  });
});

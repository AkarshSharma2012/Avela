import { describe, expect, it } from "vitest";

import { detectDeadlineConflict, detectGradeRangeConflict, summarizeConflicts } from "@/lib/opportunities/conflicts";

const NOW = new Date("2026-07-26T12:00:00Z");
const march2027 = new Date(Date.UTC(2027, 2, 15)).toISOString();
const march2026Past = new Date(Date.UTC(2026, 2, 15)).toISOString(); // already passed relative to NOW
const april2027 = new Date(Date.UTC(2027, 3, 1)).toISOString();

describe("detectDeadlineConflict", () => {
  it("is no_conflict when either deadline is unknown", () => {
    expect(detectDeadlineConflict(null, march2027, "high", "high", NOW)).toEqual({ kind: "no_conflict" });
    expect(detectDeadlineConflict(march2027, null, "high", "high", NOW)).toEqual({ kind: "no_conflict" });
  });

  it("is no_conflict when both sources report the same day", () => {
    expect(detectDeadlineConflict(march2027, march2027, "high", "high", NOW)).toEqual({ kind: "no_conflict" });
  });

  it("is resolved_by_trust when the new source is strictly more trusted, without needing review", () => {
    const result = detectDeadlineConflict(march2027, april2027, "medium", "high", NOW);
    expect(result.kind).toBe("resolved_by_trust");
  });

  it("is cycle_rollover when the new deadline is a later year and the old one has already passed", () => {
    const result = detectDeadlineConflict(march2026Past, march2027, "high", "high", NOW);
    expect(result.kind).toBe("cycle_rollover");
  });

  it("is a real conflict for a same-cycle, similar-trust disagreement", () => {
    const result = detectDeadlineConflict(march2027, april2027, "high", "high", NOW);
    expect(result.kind).toBe("conflict");
  });

  it("is a real conflict when the new source is lower-trust than the existing one", () => {
    const result = detectDeadlineConflict(march2027, april2027, "high", "medium", NOW);
    expect(result.kind).toBe("conflict");
  });
});

describe("detectGradeRangeConflict", () => {
  it("is no_conflict when either range is fully unknown", () => {
    expect(
      detectGradeRangeConflict(
        { minGrade: null, maxGrade: null },
        { minGrade: 9, maxGrade: 12 },
        "high",
        "high"
      )
    ).toEqual({ kind: "no_conflict" });
  });

  it("is no_conflict when both ranges match", () => {
    expect(
      detectGradeRangeConflict({ minGrade: 9, maxGrade: 12 }, { minGrade: 9, maxGrade: 12 }, "high", "high")
    ).toEqual({ kind: "no_conflict" });
  });

  it("is resolved_by_trust when the new source is strictly more trusted", () => {
    const result = detectGradeRangeConflict(
      { minGrade: 9, maxGrade: 12 },
      { minGrade: 6, maxGrade: 12 },
      "medium",
      "high"
    );
    expect(result.kind).toBe("resolved_by_trust");
  });

  it("is a real conflict for a same-trust grade-range disagreement", () => {
    const result = detectGradeRangeConflict(
      { minGrade: 9, maxGrade: 12 },
      { minGrade: 6, maxGrade: 8 },
      "high",
      "high"
    );
    expect(result.kind).toBe("conflict");
  });
});

describe("summarizeConflicts", () => {
  it("flags an unresolved conflict and collects its reason", () => {
    const summary = summarizeConflicts([
      { kind: "conflict", reason: "deadline mismatch" },
      { kind: "no_conflict" },
    ]);
    expect(summary.hasUnresolvedConflict).toBe(true);
    expect(summary.needsCycleConfirmation).toBe(false);
    expect(summary.reasons).toContain("deadline mismatch");
  });

  it("flags a cycle rollover as needing confirmation, not as an unresolved conflict", () => {
    const summary = summarizeConflicts([{ kind: "cycle_rollover", reason: "next year's cycle" }]);
    expect(summary.hasUnresolvedConflict).toBe(false);
    expect(summary.needsCycleConfirmation).toBe(true);
  });

  it("is clean when every verdict resolved automatically or found nothing", () => {
    const summary = summarizeConflicts([
      { kind: "no_conflict" },
      { kind: "resolved_by_trust", reason: "newer official source" },
    ]);
    expect(summary.hasUnresolvedConflict).toBe(false);
    expect(summary.needsCycleConfirmation).toBe(false);
    expect(summary.reasons).toEqual([]);
  });
});

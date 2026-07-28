import { describe, expect, it } from "vitest";

import { canTransitionLevel, listLegalNextLevels } from "@/lib/verification/level";

describe("canTransitionLevel", () => {
  it("always allows a no-op (from === to) regardless of actor", () => {
    expect(canTransitionLevel("unverified", "unverified", "student")).toBe(true);
    expect(canTransitionLevel("needs_review", "needs_review", "verifier")).toBe(true);
  });

  it("a student can move straight to evidence_added from any level, including after a rejection", () => {
    expect(canTransitionLevel("unverified", "evidence_added", "student")).toBe(true);
    expect(canTransitionLevel("rejected", "evidence_added", "student")).toBe(true);
    expect(canTransitionLevel("externally_confirmed", "evidence_added", "student")).toBe(true);
    expect(canTransitionLevel("needs_review", "evidence_added", "student")).toBe(true);
  });

  it("a student can never set externally_confirmed, needs_review, or rejected directly", () => {
    expect(canTransitionLevel("evidence_added", "externally_confirmed", "student")).toBe(false);
    expect(canTransitionLevel("evidence_added", "needs_review", "student")).toBe(false);
    expect(canTransitionLevel("evidence_added", "rejected", "student")).toBe(false);
  });

  it("a verifier can confirm directly from unverified (spec 3C: no file required for a teacher/mentor confirmation)", () => {
    expect(canTransitionLevel("unverified", "externally_confirmed", "verifier")).toBe(true);
  });

  it("a verifier can never reject — only flag for review", () => {
    expect(canTransitionLevel("evidence_added", "rejected", "verifier")).toBe(false);
    expect(canTransitionLevel("evidence_added", "needs_review", "verifier")).toBe(true);
  });

  it("only a reviewer can reject", () => {
    expect(canTransitionLevel("needs_review", "rejected", "reviewer")).toBe(true);
    expect(canTransitionLevel("needs_review", "rejected", "system")).toBe(false);
    expect(canTransitionLevel("needs_review", "rejected", "verifier")).toBe(false);
    expect(canTransitionLevel("needs_review", "rejected", "student")).toBe(false);
  });

  it("the system can move evidence toward evidence_added or needs_review, never confirm or reject on its own beyond that", () => {
    expect(canTransitionLevel("evidence_added", "needs_review", "system")).toBe(true);
    expect(canTransitionLevel("evidence_added", "rejected", "system")).toBe(false);
  });

  it("nothing ever transitions back to unverified", () => {
    for (const actor of ["student", "verifier", "reviewer", "system"] as const) {
      expect(canTransitionLevel("evidence_added", "unverified", actor)).toBe(false);
    }
  });
});

describe("listLegalNextLevels", () => {
  it("excludes the current level from its own legal-next list", () => {
    expect(listLegalNextLevels("evidence_added", "student")).not.toContain("evidence_added");
  });

  it("lists exactly what a reviewer may set", () => {
    expect(listLegalNextLevels("needs_review", "reviewer").sort()).toEqual(["externally_confirmed", "rejected"]);
  });
});

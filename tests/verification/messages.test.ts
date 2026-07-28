import { describe, expect, it } from "vitest";

import { containsForbiddenLanguage, EVIDENCE_FINDING_MESSAGES } from "@/lib/verification/messages";

describe("containsForbiddenLanguage", () => {
  it("flags every forbidden word/phrase, case-insensitively", () => {
    expect(containsForbiddenLanguage("This looks FAKE to me.")).toBe(true);
    expect(containsForbiddenLanguage("Possible fraud here.")).toBe(true);
    expect(containsForbiddenLanguage("The student is lying.")).toBe(true);
    expect(containsForbiddenLanguage("This document appears forged.")).toBe(true);
  });

  it("does not flag ordinary, respectful review copy", () => {
    expect(containsForbiddenLanguage("The evidence does not clearly match this entry.")).toBe(false);
    expect(containsForbiddenLanguage("More information is needed.")).toBe(false);
    expect(containsForbiddenLanguage("This document appears expired.")).toBe(false);
  });
});

describe("EVIDENCE_FINDING_MESSAGES — every message avoids forbidden language", () => {
  it.each(Object.entries(EVIDENCE_FINDING_MESSAGES))("%s", (_code, message) => {
    expect(containsForbiddenLanguage(message)).toBe(false);
  });
});

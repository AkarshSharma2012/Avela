import { describe, expect, it } from "vitest";

import { assertRespectfulLanguage, buildRespectfulConflictMessage, containsForbiddenLanguage, OSINT_CONFLICT_MESSAGES, OSINT_SUPPORT_LEVEL_MESSAGES } from "@/lib/osint/messages";

describe("OSINT_SUPPORT_LEVEL_MESSAGES — no false-claim language, ever", () => {
  it.each(Object.entries(OSINT_SUPPORT_LEVEL_MESSAGES))("%s avoids forbidden language", (_level, message) => {
    expect(containsForbiddenLanguage(message)).toBe(false);
  });

  it("unable_to_verify explicitly says this doesn't mean the claim is false", () => {
    expect(OSINT_SUPPORT_LEVEL_MESSAGES.unable_to_verify).toMatch(/doesn't mean it isn't true/);
  });
});

describe("OSINT_CONFLICT_MESSAGES — respectful, specific, never accusatory", () => {
  it.each(Object.entries(OSINT_CONFLICT_MESSAGES))("%s avoids forbidden language", (_reason, message) => {
    expect(containsForbiddenLanguage(message)).toBe(false);
  });
});

describe("buildRespectfulConflictMessage", () => {
  it("returns the mapped message for a known reason", () => {
    expect(buildRespectfulConflictMessage("material_date_conflict")).toMatch(/dates differ/i);
  });

  it("falls back to a generic respectful message for an unknown reason", () => {
    expect(buildRespectfulConflictMessage("some_unmapped_reason")).toBe("This may still be valid but requires other evidence.");
  });

  it("prompts to connect a GitHub username rather than commenting on the student's name", () => {
    const message = buildRespectfulConflictMessage("missing_github_identity");
    expect(message).toBe("Connect or enter your GitHub username so we can verify repository ownership.");
    expect(message).not.toMatch(/name is common/i);
  });
});

describe("assertRespectfulLanguage", () => {
  it("rejects text containing forbidden language", () => {
    expect(assertRespectfulLanguage("This looks fake to me.")).not.toBeNull();
  });

  it("accepts ordinary respectful copy", () => {
    expect(assertRespectfulLanguage("The dates differ and may need clarification.")).toBeNull();
  });
});

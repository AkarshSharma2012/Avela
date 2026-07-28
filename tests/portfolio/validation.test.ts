import { describe, expect, it } from "vitest";

import {
  MAX_TAGS,
  normalizeStringList,
  validateEvidenceNotes,
  validateGithubUsername,
  validateHoursPerWeek,
  validateItemCurrentEnd,
  validateItemDateRange,
  validateItemDescription,
  validateItemOrganization,
  validateItemOutcome,
  validateItemRole,
  validateItemTitle,
  validateItemUrl,
  validateWeeksPerYear,
} from "@/lib/portfolio/validation";

describe("validateGithubUsername", () => {
  it("accepts null/empty (optional field)", () => {
    expect(validateGithubUsername(null)).toBeNull();
    expect(validateGithubUsername("")).toBeNull();
  });

  it("accepts any format github-identity.ts normalizes", () => {
    expect(validateGithubUsername("AkarshSharma2012")).toBeNull();
    expect(validateGithubUsername("@AkarshSharma2012")).toBeNull();
    expect(validateGithubUsername("github.com/AkarshSharma2012")).toBeNull();
    expect(validateGithubUsername("https://github.com/AkarshSharma2012")).toBeNull();
  });

  it("rejects text that isn't a valid GitHub username in any format", () => {
    expect(validateGithubUsername("this is not a username!!")).toMatch(/valid github username/i);
    expect(validateGithubUsername("https://example.com/notgithub")).toMatch(/valid github username/i);
  });
});

describe("validateItemTitle", () => {
  it("rejects empty or whitespace-only titles", () => {
    expect(validateItemTitle("")).toMatch(/give this item a title/i);
    expect(validateItemTitle("   ")).toMatch(/give this item a title/i);
  });

  it("rejects an unreasonably long title", () => {
    expect(validateItemTitle("a".repeat(201))).toMatch(/too long/i);
  });

  it("accepts a normal title", () => {
    expect(validateItemTitle("Debate Team Captain")).toBeNull();
  });
});

describe("validateItemOrganization / validateItemRole / validateItemOutcome / validateItemDescription", () => {
  it("accept null", () => {
    expect(validateItemOrganization(null)).toBeNull();
    expect(validateItemRole(null)).toBeNull();
    expect(validateItemOutcome(null)).toBeNull();
    expect(validateItemDescription(null)).toBeNull();
  });

  it("reject over-length values", () => {
    expect(validateItemOrganization("a".repeat(201))).toMatch(/too long/i);
    expect(validateItemRole("a".repeat(201))).toMatch(/too long/i);
    expect(validateItemOutcome("a".repeat(2001))).toMatch(/too long/i);
    expect(validateItemDescription("a".repeat(5001))).toMatch(/too long/i);
  });
});

describe("validateItemUrl", () => {
  it("accepts null and empty", () => {
    expect(validateItemUrl(null)).toBeNull();
    expect(validateItemUrl("")).toBeNull();
    expect(validateItemUrl("   ")).toBeNull();
  });

  it("accepts a well-formed http(s) URL", () => {
    expect(validateItemUrl("https://example.org/my-project")).toBeNull();
    expect(validateItemUrl("http://example.org")).toBeNull();
  });

  it("rejects a non-URL string", () => {
    expect(validateItemUrl("not a url")).toMatch(/doesn't look like a valid link/i);
  });

  it("rejects a non-http(s) protocol — e.g. javascript: — even though it parses as a valid URL", () => {
    expect(validateItemUrl("javascript:alert(1)")).toMatch(/must start with http/i);
    expect(validateItemUrl("ftp://example.org/file")).toMatch(/must start with http/i);
  });
});

describe("validateItemDateRange", () => {
  it("passes when either date is unknown", () => {
    expect(validateItemDateRange(null, "2026-08-10")).toBeNull();
    expect(validateItemDateRange("2026-08-01", null)).toBeNull();
  });

  it("rejects an end date before the start date", () => {
    expect(validateItemDateRange("2026-08-10", "2026-08-01")).toMatch(/end date can't be before/i);
  });

  it("accepts an end date on or after the start date", () => {
    expect(validateItemDateRange("2026-08-01", "2026-08-01")).toBeNull();
    expect(validateItemDateRange("2026-08-01", "2026-08-10")).toBeNull();
  });
});

describe("validateItemCurrentEnd", () => {
  it("rejects 'still doing this' paired with a fixed end date", () => {
    expect(validateItemCurrentEnd(true, "2026-08-10")).toMatch(/still doing this/i);
  });

  it("accepts 'still doing this' with no end date, and a fixed end date when not current", () => {
    expect(validateItemCurrentEnd(true, null)).toBeNull();
    expect(validateItemCurrentEnd(false, "2026-08-10")).toBeNull();
  });
});

describe("validateHoursPerWeek / validateWeeksPerYear", () => {
  it("accept null", () => {
    expect(validateHoursPerWeek(null)).toBeNull();
    expect(validateWeeksPerYear(null)).toBeNull();
  });

  it("accept in-range values", () => {
    expect(validateHoursPerWeek(10)).toBeNull();
    expect(validateHoursPerWeek(0)).toBeNull();
    expect(validateHoursPerWeek(168)).toBeNull();
    expect(validateWeeksPerYear(52)).toBeNull();
  });

  it("reject out-of-range or non-finite values", () => {
    expect(validateHoursPerWeek(-1)).toMatch(/between 0 and 168/i);
    expect(validateHoursPerWeek(169)).toMatch(/between 0 and 168/i);
    expect(validateHoursPerWeek(Number.NaN)).toMatch(/between 0 and 168/i);
    expect(validateWeeksPerYear(53)).toMatch(/between 0 and 52/i);
    expect(validateWeeksPerYear(-1)).toMatch(/between 0 and 52/i);
  });
});

describe("validateEvidenceNotes", () => {
  it("accepts null and reasonably short notes", () => {
    expect(validateEvidenceNotes(null)).toBeNull();
    expect(validateEvidenceNotes("For the recommendation packet")).toBeNull();
  });

  it("rejects notes over the length cap", () => {
    expect(validateEvidenceNotes("a".repeat(1001))).toMatch(/too long/i);
  });
});

describe("normalizeStringList", () => {
  it("trims, drops empties, and de-duplicates case-insensitively", () => {
    expect(normalizeStringList(["  Public speaking ", "public speaking", "Excel", ""], 20, 40)).toEqual([
      "Public speaking",
      "Excel",
    ]);
  });

  it("drops entries over the max length", () => {
    expect(normalizeStringList(["ok", "a".repeat(41)], 20, 40)).toEqual(["ok"]);
  });

  it("caps the result at maxItems", () => {
    const many = Array.from({ length: MAX_TAGS + 5 }, (_, i) => `tag-${i}`);
    expect(normalizeStringList(many, MAX_TAGS, 40)).toHaveLength(MAX_TAGS);
  });
});

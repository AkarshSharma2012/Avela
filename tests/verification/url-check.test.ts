import { describe, expect, it } from "vitest";

import { checkOfficialUrl, domainQualifiesForConfirmation } from "@/lib/verification/url-check";

describe("checkOfficialUrl", () => {
  it("rejects a malformed URL", () => {
    const result = checkOfficialUrl("not a url");
    expect(result.valid).toBe(false);
  });

  it("rejects non-https URLs", () => {
    const result = checkOfficialUrl("http://example.org");
    expect(result.valid).toBe(false);
  });

  it("classifies a .edu domain as trusted", () => {
    const result = checkOfficialUrl("https://www.lincolnhigh.edu/awards");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.isTrustedDomain).toBe(true);
      expect(result.isSocialMedia).toBe(false);
    }
  });

  it("classifies a curated organization domain as trusted", () => {
    const result = checkOfficialUrl("https://www.redcross.org/volunteer/confirm");
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.isTrustedDomain).toBe(true);
  });

  it("never treats a social media host as trusted or official", () => {
    const result = checkOfficialUrl("https://www.instagram.com/someclub");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.isSocialMedia).toBe(true);
      expect(domainQualifiesForConfirmation(result)).toBe(false);
    }
  });

  it("an ordinary unknown https domain is valid and can still be used as evidence", () => {
    const result = checkOfficialUrl("https://www.someclub.org/results");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.isSocialMedia).toBe(false);
      expect(domainQualifiesForConfirmation(result)).toBe(true);
    }
  });
});

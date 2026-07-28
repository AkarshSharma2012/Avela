import { describe, expect, it } from "vitest";

import { githubProfileUrl, loginContainsNameTokens, normalizeGithubUsername } from "@/lib/osint/github-identity";

describe("normalizeGithubUsername", () => {
  it("accepts a bare username", () => {
    expect(normalizeGithubUsername("AkarshSharma2012")).toBe("AkarshSharma2012");
  });

  it("strips an @ prefix", () => {
    expect(normalizeGithubUsername("@AkarshSharma2012")).toBe("AkarshSharma2012");
  });

  it("strips github.com/ and https://github.com/", () => {
    expect(normalizeGithubUsername("github.com/AkarshSharma2012")).toBe("AkarshSharma2012");
    expect(normalizeGithubUsername("https://github.com/AkarshSharma2012")).toBe("AkarshSharma2012");
    expect(normalizeGithubUsername("https://www.github.com/AkarshSharma2012")).toBe("AkarshSharma2012");
  });

  it("drops a trailing path/query/hash from a profile URL", () => {
    expect(normalizeGithubUsername("https://github.com/AkarshSharma2012/Avela")).toBe("AkarshSharma2012");
    expect(normalizeGithubUsername("https://github.com/AkarshSharma2012?tab=repositories")).toBe("AkarshSharma2012");
  });

  it("returns null for empty/whitespace input", () => {
    expect(normalizeGithubUsername(null)).toBeNull();
    expect(normalizeGithubUsername(undefined)).toBeNull();
    expect(normalizeGithubUsername("   ")).toBeNull();
  });

  it("returns null for a non-GitHub URL or invalid characters", () => {
    expect(normalizeGithubUsername("https://example.com/someone")).toBeNull();
    expect(normalizeGithubUsername("not a username!!")).toBeNull();
  });
});

describe("githubProfileUrl", () => {
  it("builds a github.com profile URL from a username", () => {
    expect(githubProfileUrl("AkarshSharma2012")).toBe("https://github.com/AkarshSharma2012");
  });
});

describe("loginContainsNameTokens — weak fallback only, never ownership proof", () => {
  it("matches when a concatenated login contains every name token", () => {
    expect(loginContainsNameTokens("AkarshSharma2012", "Akarsh Sharma")).toBe(true);
  });

  it("does not match when the login is unrelated", () => {
    expect(loginContainsNameTokens("someorg", "Akarsh Sharma")).toBe(false);
  });

  it("does not match on an empty/too-short name", () => {
    expect(loginContainsNameTokens("AkarshSharma2012", "Jo")).toBe(false);
  });
});

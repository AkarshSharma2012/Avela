import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/osint/safe-fetch", () => ({ safeFetch: vi.fn() }));

import { safeFetch } from "@/lib/osint/safe-fetch";
import { githubConnector, isGithubRepositoryUrl } from "@/lib/osint/connectors/github";
import type { ClaimInput } from "@/lib/osint/types";

const mockedSafeFetch = vi.mocked(safeFetch);

const BASE_CLAIM: ClaimInput = {
  claimType: "project",
  studentDisplayName: "Akarsh Sharma",
  title: "Avela",
  organization: null,
  role: null,
  description: null,
  startDate: null,
  endDate: null,
  url: "https://github.com/AkarshSharma2012/Avela",
  connectedGithubUsername: "AkarshSharma2012",
};

function jsonOk(body: unknown) {
  return { status: "ok" as const, finalUrl: "https://api.github.com/mock", statusCode: 200, contentType: "application/json", body: JSON.stringify(body) };
}

const httpError = { status: "http_error" as const, finalUrl: "https://api.github.com/mock", statusCode: 404 };

const REPO_BASE = {
  full_name: "AkarshSharma2012/Avela",
  description: "Avela — student opportunity discovery and portfolio platform",
  owner: { login: "AkarshSharma2012", type: "User" },
  html_url: "https://github.com/AkarshSharma2012/Avela",
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-06-01T00:00:00Z",
  default_branch: "main",
  stargazers_count: 3,
  forks_count: 0,
  archived: false,
  fork: false,
  private: false,
};

function readmeResponse(text: string) {
  return jsonOk({ content: Buffer.from(text, "utf-8").toString("base64"), encoding: "base64" });
}

beforeEach(() => {
  mockedSafeFetch.mockReset();
});

describe("githubConnector.applies / isGithubRepositoryUrl", () => {
  it("applies only to a github.com repository URL", () => {
    expect(githubConnector.applies(BASE_CLAIM)).toBe(true);
    expect(githubConnector.applies({ ...BASE_CLAIM, url: "https://example.com/not-github" })).toBe(false);
    expect(githubConnector.applies({ ...BASE_CLAIM, url: null })).toBe(false);
  });

  it("isGithubRepositoryUrl recognizes repo links (used by official-page.ts to avoid double-counting)", () => {
    expect(isGithubRepositoryUrl("https://github.com/AkarshSharma2012/Avela")).toBe(true);
    expect(isGithubRepositoryUrl("https://example.com/x")).toBe(false);
  });
});

describe("githubConnector.run — exact repository owner match", () => {
  it("matches when the connected GitHub username exactly owns the repository", async () => {
    mockedSafeFetch
      .mockResolvedValueOnce(jsonOk(REPO_BASE)) // repo
      .mockResolvedValueOnce(jsonOk([{ login: "AkarshSharma2012" }])) // contributors
      .mockResolvedValueOnce(readmeResponse("Avela is a student opportunity and portfolio platform.")) // readme
      .mockResolvedValueOnce(jsonOk([{ sha: "abc123" }])); // commits?author=

    const outcome = await githubConnector.run(BASE_CLAIM);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.evidence).toHaveLength(1);
    const fields = outcome.evidence[0]!.extractedFields;
    expect(fields.ownerLoginMatch).toBe(true);
    expect(outcome.evidence[0]!.authorityLevel).toBe("trusted_registry");
  });

  it("produces exactly one evidence entry even when owner, contributor, and commit-author all match (no duplicate GitHub cards)", async () => {
    mockedSafeFetch
      .mockResolvedValueOnce(jsonOk(REPO_BASE))
      .mockResolvedValueOnce(jsonOk([{ login: "AkarshSharma2012" }]))
      .mockResolvedValueOnce(readmeResponse("Avela"))
      .mockResolvedValueOnce(jsonOk([{ sha: "abc123" }]));

    const outcome = await githubConnector.run(BASE_CLAIM);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.evidence).toHaveLength(1);
    const fields = outcome.evidence[0]!.extractedFields;
    expect(fields.ownerLoginMatch).toBe(true);
    expect(fields.contributorLoginMatch).toBe(true);
    expect(fields.commitAuthorLoginMatch).toBe(true);
  });
});

describe("githubConnector.run — contributor login match (not owner)", () => {
  it("matches when the connected username is a listed contributor but not the owner", async () => {
    mockedSafeFetch
      .mockResolvedValueOnce(jsonOk({ ...REPO_BASE, owner: { login: "someorg", type: "Organization" }, full_name: "someorg/Avela" }))
      .mockResolvedValueOnce(jsonOk([{ login: "otheruser" }, { login: "AkarshSharma2012" }]))
      .mockResolvedValueOnce(httpError) // no readme
      .mockResolvedValueOnce({ status: "ok" as const, finalUrl: "https://api.github.com/mock", statusCode: 200, contentType: "application/json", body: JSON.stringify([]) }) // no authored commits found
      .mockResolvedValueOnce(jsonOk([{ login: "someone-else" }])); // org public members — connected user not listed

    const outcome = await githubConnector.run(BASE_CLAIM);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const fields = outcome.evidence[0]!.extractedFields;
    expect(fields.ownerLoginMatch).toBe(false);
    expect(fields.contributorLoginMatch).toBe(true);
    expect(outcome.evidence[0]!.authorityLevel).toBe("trusted_registry");
  });
});

describe("githubConnector.run — commit author match", () => {
  it("matches when the connected username authored commits but isn't the owner or in the (possibly truncated) contributor list", async () => {
    mockedSafeFetch
      .mockResolvedValueOnce(jsonOk({ ...REPO_BASE, owner: { login: "someorg", type: "Organization" } }))
      .mockResolvedValueOnce(jsonOk([{ login: "otheruser" }]))
      .mockResolvedValueOnce(httpError)
      .mockResolvedValueOnce(jsonOk([{ sha: "abc123" }]))
      .mockResolvedValueOnce(jsonOk([]));

    const outcome = await githubConnector.run(BASE_CLAIM);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const fields = outcome.evidence[0]!.extractedFields;
    expect(fields.commitAuthorLoginMatch).toBe(true);
    expect(fields.ownerLoginMatch).toBe(false);
    expect(fields.contributorLoginMatch).toBe(false);
  });
});

describe("githubConnector.run — owner mismatch", () => {
  it("flags unclear ownership when the connected account doesn't own, contribute to, or author commits in the repo", async () => {
    mockedSafeFetch
      .mockResolvedValueOnce(jsonOk({ ...REPO_BASE, owner: { login: "someorg", type: "Organization" } }))
      .mockResolvedValueOnce(jsonOk([{ login: "unrelated-person" }]))
      .mockResolvedValueOnce(httpError)
      .mockResolvedValueOnce(jsonOk([]))
      .mockResolvedValueOnce(jsonOk([{ login: "someone-else" }]));

    const outcome = await githubConnector.run(BASE_CLAIM);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const fields = outcome.evidence[0]!.extractedFields;
    expect(fields.ownershipUnclear).toBe(true);
    expect(fields.ownerLoginMatch).toBe(false);
    expect(fields.contributorLoginMatch).toBe(false);
    expect(fields.commitAuthorLoginMatch).toBe(false);
    expect(outcome.evidence[0]!.authorityLevel).toBe("unknown");
  });
});

describe("githubConnector.run — missing GitHub username", () => {
  it("flags connectedUsernameMissing (not ownershipUnclear) and never runs a commit-author lookup", async () => {
    mockedSafeFetch
      .mockResolvedValueOnce(jsonOk(REPO_BASE))
      .mockResolvedValueOnce(jsonOk([{ login: "AkarshSharma2012" }]))
      .mockResolvedValueOnce(httpError);

    const outcome = await githubConnector.run({ ...BASE_CLAIM, connectedGithubUsername: null });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const fields = outcome.evidence[0]!.extractedFields;
    expect(fields.connectedUsernameMissing).toBe(true);
    expect(fields.ownershipUnclear).toBe(false);
    expect(fields.ownerLoginMatch).toBe(false);
    // Only 3 calls: repo, contributors, readme — no commits?author= lookup without a username.
    expect(mockedSafeFetch).toHaveBeenCalledTimes(3);
  });
});

describe("githubConnector.run — display-name-only match stays weak", () => {
  it("never sets ownerLoginMatch/contributorLoginMatch/commitAuthorLoginMatch from a display-name resemblance alone", async () => {
    mockedSafeFetch
      .mockResolvedValueOnce(jsonOk(REPO_BASE)) // owner login "AkarshSharma2012" happens to contain the display name's tokens
      .mockResolvedValueOnce(jsonOk([{ login: "AkarshSharma2012" }]))
      .mockResolvedValueOnce(httpError);

    // No connected username at all — the only thing that could tie this to the student is the name.
    const outcome = await githubConnector.run({ ...BASE_CLAIM, connectedGithubUsername: null });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const fields = outcome.evidence[0]!.extractedFields;
    expect(fields.ownerLoginMatch).toBe(false);
    expect(fields.contributorLoginMatch).toBe(false);
    expect(fields.commitAuthorLoginMatch).toBe(false);
    // The weak fallback signal may fire, but it must never imply ownership.
    expect(fields.displayNameOnlyMatch).toBe(true);
    expect(outcome.evidence[0]!.authorityLevel).toBe("unknown");
  });
});

describe("githubConnector.run — repository existence alone", () => {
  it("never sets any ownership-match field when nothing ties the repo to the student", async () => {
    mockedSafeFetch
      .mockResolvedValueOnce(jsonOk({ ...REPO_BASE, owner: { login: "someorg", type: "Organization" }, description: "An unrelated project" }))
      .mockResolvedValueOnce(jsonOk([{ login: "unrelated-person" }]))
      .mockResolvedValueOnce(httpError);

    const outcome = await githubConnector.run({
      ...BASE_CLAIM,
      studentDisplayName: "Completely Different Name",
      connectedGithubUsername: null,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const fields = outcome.evidence[0]!.extractedFields;
    expect(fields.ownerLoginMatch).toBe(false);
    expect(fields.contributorLoginMatch).toBe(false);
    expect(fields.commitAuthorLoginMatch).toBe(false);
    expect(outcome.evidence[0]!.authorityLevel).toBe("unknown");
  });
});

describe("githubConnector.run — safety and repository state", () => {
  it("refuses to record a private repository as evidence", async () => {
    mockedSafeFetch.mockResolvedValueOnce(jsonOk({ full_name: "jordan-smith/secret", owner: { login: "jordan-smith" }, private: true }));
    const outcome = await githubConnector.run(BASE_CLAIM);
    expect(outcome.ok).toBe(false);
  });

  it("fails independently (never throws) when the GitHub API call itself fails", async () => {
    mockedSafeFetch.mockResolvedValueOnce({ status: "http_error", finalUrl: "https://api.github.com/mock", statusCode: 404 });
    const outcome = await githubConnector.run(BASE_CLAIM);
    expect(outcome.ok).toBe(false);
  });
});

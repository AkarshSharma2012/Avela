import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/osint/safe-fetch", () => ({ safeFetch: vi.fn() }));

import { safeFetch } from "@/lib/osint/safe-fetch";
import { nativeResearchProvider } from "@/lib/research/native-provider";

const mockSafeFetch = vi.mocked(safeFetch);

afterEach(() => {
  vi.clearAllMocks();
});

describe("nativeResearchProvider.healthCheck", () => {
  it("is always available — no external service dependency", async () => {
    expect(await nativeResearchProvider.healthCheck()).toEqual({ ok: true });
  });
});

describe("nativeResearchProvider.searchWeb", () => {
  it("has no keyless implementation and honestly reports unavailable", async () => {
    const result = await nativeResearchProvider.searchWeb({ query: "anything" });
    expect(result).toEqual({ ok: false, reason: "Web search isn't available right now." });
  });
});

describe("nativeResearchProvider.readPublicPage", () => {
  it("extracts title and structured-metadata presence from a fetched page", async () => {
    mockSafeFetch.mockResolvedValueOnce({
      status: "ok",
      finalUrl: "https://example.org/page",
      statusCode: 200,
      contentType: "text/html",
      body: `<html><head><title>Example Org Award</title><script type="application/ld+json">{"@type":"Award"}</script></head><body>Some text</body></html>`,
    });
    const result = await nativeResearchProvider.readPublicPage({ url: "https://example.org/page" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.results[0]?.extractedFields.title).toBe("Example Org Award");
      expect(result.results[0]?.extractedFields.hasStructuredMetadata).toBe(true);
      expect(result.results[0]?.authorityLevel).toBe("unknown");
    }
  });

  it("fails independently when the fetch itself fails", async () => {
    mockSafeFetch.mockResolvedValueOnce({ status: "http_error", finalUrl: "https://example.org/page", statusCode: 404 });
    const result = await nativeResearchProvider.readPublicPage({ url: "https://example.org/page" });
    expect(result.ok).toBe(false);
  });
});

describe("nativeResearchProvider.inspectGitHubRepository", () => {
  it("rejects a private repository rather than treating it as evidence", async () => {
    mockSafeFetch.mockResolvedValueOnce({
      status: "ok",
      finalUrl: "https://api.github.com/repos/octocat/secret",
      statusCode: 200,
      contentType: "application/json",
      body: JSON.stringify({ private: true }),
    });
    const result = await nativeResearchProvider.inspectGitHubRepository({ githubRepo: { owner: "octocat", repo: "secret" } });
    expect(result).toEqual({ ok: false, reason: "Repository is not public." });
  });

  it("extracts fork/owner fields for a public repository", async () => {
    mockSafeFetch.mockResolvedValueOnce({
      status: "ok",
      finalUrl: "https://api.github.com/repos/octocat/hello",
      statusCode: 200,
      contentType: "application/json",
      body: JSON.stringify({ full_name: "octocat/hello", fork: true, owner: { login: "octocat", type: "User" }, html_url: "https://github.com/octocat/hello" }),
    });
    const result = await nativeResearchProvider.inspectGitHubRepository({ githubRepo: { owner: "octocat", repo: "hello" } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.results[0]?.extractedFields.isFork).toBe(true);
      expect(result.results[0]?.sourceType).toBe("github");
    }
  });
});

describe("nativeResearchProvider.inspectPublicVideoMetadata", () => {
  it("uses YouTube's keyless oEmbed endpoint", async () => {
    mockSafeFetch.mockResolvedValueOnce({
      status: "ok",
      finalUrl: "https://www.youtube.com/oembed?url=x&format=json",
      statusCode: 200,
      contentType: "application/json",
      body: JSON.stringify({ title: "My Demo", author_name: "A Student", provider_name: "YouTube" }),
    });
    const result = await nativeResearchProvider.inspectPublicVideoMetadata({ url: "https://www.youtube.com/watch?v=abc123" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.results[0]?.extractedFields.title).toBe("My Demo");
  });

  it("rejects an unsupported platform without attempting a fetch", async () => {
    const result = await nativeResearchProvider.inspectPublicVideoMetadata({ url: "https://example.com/video" });
    expect(result).toEqual({ ok: false, reason: "Unsupported video platform." });
    expect(mockSafeFetch).not.toHaveBeenCalled();
  });
});

describe("nativeResearchProvider.inspectRssFeed", () => {
  it("extracts a feed title and item count without a full XML parser", async () => {
    mockSafeFetch.mockResolvedValueOnce({
      status: "ok",
      finalUrl: "https://example.org/feed.xml",
      statusCode: 200,
      contentType: "application/rss+xml",
      body: `<rss><channel><title>Example Feed</title><item>1</item><item>2</item></channel></rss>`,
    });
    const result = await nativeResearchProvider.inspectRssFeed({ url: "https://example.org/feed.xml" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.results[0]?.extractedFields.feedTitle).toBe("Example Feed");
      expect(result.results[0]?.extractedFields.itemCount).toBe(2);
    }
  });
});

describe("nativeResearchProvider.inspectPublicDiscussion", () => {
  it("only supports public GitHub issues/PRs, rejecting other discussion URLs", async () => {
    const result = await nativeResearchProvider.inspectPublicDiscussion({ url: "https://reddit.com/r/foo/comments/123" });
    expect(result).toEqual({ ok: false, reason: "Only public GitHub issues/PRs are supported." });
  });

  it("carries a warning that discussion evidence never independently confirms identity/authorship/employment/impact", async () => {
    mockSafeFetch.mockResolvedValueOnce({
      status: "ok",
      finalUrl: "https://api.github.com/repos/octocat/hello/issues/1",
      statusCode: 200,
      contentType: "application/json",
      body: JSON.stringify({ title: "Bug report", state: "open", user: { login: "someone" }, comments: 3, html_url: "https://github.com/octocat/hello/issues/1" }),
    });
    const result = await nativeResearchProvider.inspectPublicDiscussion({ url: "https://github.com/octocat/hello/issues/1" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.results[0]?.authorityLevel).toBe("secondary_source");
      expect(result.results[0]?.warnings.length).toBeGreaterThan(0);
    }
  });
});

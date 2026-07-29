/**
 * The real, always-available implementation of PublicResearchProvider —
 * wraps the keyless connectors this codebase already has (safe-fetch, HTML/
 * JSON-LD extraction) rather than reimplementing them, plus two new keyless
 * lookups (video oEmbed, RSS) that didn't exist before this milestone.
 * `searchWeb` has no keyless implementation available and honestly reports
 * "not available" rather than guessing.
 */

import { createHash } from "node:crypto";

import { extractJsonLdBlocks, extractPlainText, extractTitle } from "@/lib/osint/connectors/html";
import { safeFetch } from "@/lib/osint/safe-fetch";
import type { PublicResearchProvider, ResearchOutcome, ResearchQuery, ResearchResult } from "@/lib/research/types";

function hashExcerpt(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function excerptOf(text: string, maxLength = 500): string {
  return text.length > maxLength ? text.slice(0, maxLength - 1) + "…" : text;
}

async function fetchGithubApiJson(path: string): Promise<{ ok: true; data: unknown } | { ok: false; reason: string }> {
  const token = process.env.GITHUB_TOKEN;
  const result = await safeFetch(`https://api.github.com${path}`, {
    fetchImpl: token
      ? ((input, init) => fetch(input, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` } })) as typeof fetch
      : undefined,
  });
  if (result.status !== "ok") return { ok: false, reason: `GitHub API request failed (${result.status}).` };
  try {
    return { ok: true, data: JSON.parse(result.body) };
  } catch {
    return { ok: false, reason: "GitHub API returned an unparsable response." };
  }
}

export const nativeResearchProvider: PublicResearchProvider = {
  name: "native",

  async healthCheck() {
    return { ok: true };
  },

  async searchWeb(): Promise<ResearchOutcome> {
    return { ok: false, reason: "Web search isn't available right now." };
  },

  async readPublicPage(query: ResearchQuery): Promise<ResearchOutcome> {
    if (!query.url) return { ok: false, reason: "No URL provided." };
    const fetched = await safeFetch(query.url);
    if (fetched.status !== "ok") return { ok: false, reason: `Could not fetch that page (${fetched.status}).` };

    const title = extractTitle(fetched.body);
    const plainText = extractPlainText(fetched.body);
    const jsonLdBlocks = extractJsonLdBlocks(fetched.body);
    const excerpt = excerptOf(plainText);

    const result: ResearchResult = {
      sourceType: "official_organization",
      sourceUrl: fetched.finalUrl,
      sourceDomain: hostnameOf(fetched.finalUrl),
      authorityLevel: "unknown",
      retrievedAt: new Date().toISOString(),
      extractedFields: { title, hasStructuredMetadata: jsonLdBlocks.length > 0 },
      confidence: 30,
      excerpt,
      contentHash: hashExcerpt(plainText),
      warnings: [],
      connectorName: "native.readPublicPage",
    };
    return { ok: true, results: [result] };
  },

  async inspectGitHubRepository(query: ResearchQuery): Promise<ResearchOutcome> {
    if (!query.githubRepo) return { ok: false, reason: "No repository specified." };
    const { owner, repo } = query.githubRepo;
    const repoResult = await fetchGithubApiJson(`/repos/${owner}/${repo}`);
    if (!repoResult.ok) return { ok: false, reason: repoResult.reason };

    const data = repoResult.data as {
      full_name?: string;
      description?: string | null;
      fork?: boolean;
      private?: boolean;
      html_url?: string;
      owner?: { login?: string; type?: string };
    };
    if (data.private) return { ok: false, reason: "Repository is not public." };

    const result: ResearchResult = {
      sourceType: "github",
      sourceUrl: data.html_url ?? `https://github.com/${owner}/${repo}`,
      sourceDomain: "github.com",
      authorityLevel: "unknown",
      retrievedAt: new Date().toISOString(),
      extractedFields: {
        fullName: data.full_name ?? `${owner}/${repo}`,
        isFork: data.fork ?? false,
        ownerLogin: data.owner?.login ?? owner,
        ownerType: data.owner?.type ?? null,
      },
      confidence: 40,
      excerpt: data.description ? excerptOf(data.description) : null,
      contentHash: hashExcerpt(JSON.stringify(data)),
      warnings: [],
      connectorName: "native.inspectGitHubRepository",
    };
    return { ok: true, results: [result] };
  },

  /** Keyless oEmbed endpoints — no API key needed for either YouTube or Vimeo's public oEmbed lookups. */
  async inspectPublicVideoMetadata(query: ResearchQuery): Promise<ResearchOutcome> {
    if (!query.url) return { ok: false, reason: "No video URL provided." };
    const host = hostnameOf(query.url);
    const isYoutube = host.includes("youtube.com") || host.includes("youtu.be");
    const isVimeo = host.includes("vimeo.com");
    if (!isYoutube && !isVimeo) return { ok: false, reason: "Unsupported video platform." };

    const oembedUrl = isYoutube
      ? `https://www.youtube.com/oembed?url=${encodeURIComponent(query.url)}&format=json`
      : `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(query.url)}`;

    const fetched = await safeFetch(oembedUrl, { allowedContentTypes: ["application/json"] });
    if (fetched.status !== "ok") return { ok: false, reason: `Could not fetch video metadata (${fetched.status}).` };

    let data: { title?: string; author_name?: string; provider_name?: string };
    try {
      data = JSON.parse(fetched.body);
    } catch {
      return { ok: false, reason: "Video metadata response was unparsable." };
    }

    const result: ResearchResult = {
      sourceType: "video_platform",
      sourceUrl: query.url,
      sourceDomain: host,
      authorityLevel: "unknown",
      retrievedAt: new Date().toISOString(),
      extractedFields: { title: data.title ?? null, authorName: data.author_name ?? null, provider: data.provider_name ?? (isYoutube ? "YouTube" : "Vimeo") },
      confidence: 25,
      excerpt: data.title ? excerptOf(data.title) : null,
      contentHash: hashExcerpt(JSON.stringify(data)),
      warnings: [],
      connectorName: "native.inspectPublicVideoMetadata",
    };
    return { ok: true, results: [result] };
  },

  /** Basic feed-metadata extraction — a lightweight regex-based title/link pull, not a full RSS/Atom parser, since this is only ever supporting context. */
  async inspectRssFeed(query: ResearchQuery): Promise<ResearchOutcome> {
    if (!query.url) return { ok: false, reason: "No feed URL provided." };
    const fetched = await safeFetch(query.url, { allowedContentTypes: ["application/rss+xml", "application/xml", "text/xml"] });
    if (fetched.status !== "ok") return { ok: false, reason: `Could not fetch that feed (${fetched.status}).` };

    const titleMatch = /<title>(?:<!\[CDATA\[)?([^<]*?)(?:\]\]>)?<\/title>/i.exec(fetched.body);
    const feedTitle = titleMatch?.[1]?.trim() ?? null;
    const itemCount = (fetched.body.match(/<item[\s>]/gi) ?? []).length;

    const result: ResearchResult = {
      sourceType: "rss_feed",
      sourceUrl: fetched.finalUrl,
      sourceDomain: hostnameOf(fetched.finalUrl),
      authorityLevel: "unknown",
      retrievedAt: new Date().toISOString(),
      extractedFields: { feedTitle, itemCount },
      confidence: 20,
      excerpt: feedTitle,
      contentHash: hashExcerpt(fetched.body.slice(0, 5000)),
      warnings: [],
      connectorName: "native.inspectRssFeed",
    };
    return { ok: true, results: [result] };
  },

  /** Keyless GitHub issue/PR REST lookup — the only "public discussion" source this codebase can read without an API key or scraping a social platform. */
  async inspectPublicDiscussion(query: ResearchQuery): Promise<ResearchOutcome> {
    if (!query.url) return { ok: false, reason: "No discussion URL provided." };
    const match = /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/(issues|pull)\/(\d+)/i.exec(query.url.trim());
    if (!match) return { ok: false, reason: "Only public GitHub issues/PRs are supported." };
    const [, owner, repo, , number] = match;

    const apiResult = await fetchGithubApiJson(`/repos/${owner}/${repo}/issues/${number}`);
    if (!apiResult.ok) return { ok: false, reason: apiResult.reason };

    const data = apiResult.data as { title?: string; state?: string; user?: { login?: string }; html_url?: string; comments?: number };

    const result: ResearchResult = {
      sourceType: "public_discussion",
      sourceUrl: data.html_url ?? query.url,
      sourceDomain: "github.com",
      authorityLevel: "secondary_source",
      retrievedAt: new Date().toISOString(),
      extractedFields: { title: data.title ?? null, state: data.state ?? null, authorLogin: data.user?.login ?? null, commentCount: data.comments ?? 0 },
      confidence: 20,
      excerpt: data.title ? excerptOf(data.title) : null,
      contentHash: hashExcerpt(JSON.stringify(data)),
      warnings: ["Social/discussion evidence is secondary context only — it never independently confirms identity, authorship, employment, or impact."],
      connectorName: "native.inspectPublicDiscussion",
    };
    return { ok: true, results: [result] };
  },
};

/**
 * The provider boundary spec section 13 asks for: Agent-Reach (or any
 * future third-party research tool) is never the verification authority
 * itself — it can only ever discover a source, and authority comes from
 * the source, normalized into the same shape every provider returns.
 * Nothing that implements this interface is allowed to directly set
 * `externally_confirmed`, identity confirmation, employment confirmation,
 * organizational authority, or any admissions/eligibility field — see
 * claims/research-signals.ts, the only place a ResearchResult is ever
 * turned into claim-dimension input, and even there it only ever feeds a
 * low-priority supporting-evidence bucket.
 */

export type ResearchSourceType =
  | "official_organization"
  | "github"
  | "crossref"
  | "video_platform"
  | "rss_feed"
  | "public_discussion"
  | "web_search"
  | "other";

/** Never "confirmed" — authority is a property of the source, not of whichever connector found it. */
export type ResearchAuthorityLevel = "issuer" | "official_organization" | "trusted_registry" | "verified_public_profile" | "secondary_source" | "unknown";

export type ResearchResult = {
  sourceType: ResearchSourceType;
  sourceUrl: string;
  sourceDomain: string;
  authorityLevel: ResearchAuthorityLevel;
  retrievedAt: string;
  /** Minimal, structured facts only — never a full page body or an LLM summary standing in for evidence (spec section 13: "Never allow an LLM summary alone to count as evidence"). */
  extractedFields: Record<string, string | number | boolean | null>;
  /** 0-100, this connector's own confidence the result actually matches what was searched for — never the final claim-dimension confidence by itself. */
  confidence: number;
  /** A short excerpt for human review only — never treated as evidence in its own right. */
  excerpt: string | null;
  /** sha256 of the excerpt/content actually inspected — lets a duplicate-source check dedupe across connectors without re-fetching. */
  contentHash: string;
  warnings: string[];
  connectorName: string;
};

export type ResearchOutcome = { ok: true; results: ResearchResult[] } | { ok: false; reason: string };

export type ResearchQuery = {
  /** Free-text search terms — only ever used by searchWeb, and only ever built from a claim's own title/organization, never a student-supplied arbitrary query. */
  query?: string;
  /** A specific URL to read — must already be https and pass the same SSRF checks every other OSINT fetch does. */
  url?: string;
  /** owner/repo form for inspectGitHubRepository. */
  githubRepo?: { owner: string; repo: string };
};

/**
 * Every method returns the same ResearchOutcome shape and never throws —
 * a provider that can't perform a given lookup (unconfigured, unavailable,
 * not implemented) returns `{ ok: false, reason }`, exactly like every
 * OSINT connector in this codebase already does with ConnectorOutcome.
 */
export interface PublicResearchProvider {
  readonly name: string;
  healthCheck(): Promise<{ ok: boolean; reason?: string }>;
  searchWeb(query: ResearchQuery): Promise<ResearchOutcome>;
  readPublicPage(query: ResearchQuery): Promise<ResearchOutcome>;
  inspectGitHubRepository(query: ResearchQuery): Promise<ResearchOutcome>;
  inspectPublicVideoMetadata(query: ResearchQuery): Promise<ResearchOutcome>;
  inspectRssFeed(query: ResearchQuery): Promise<ResearchOutcome>;
  inspectPublicDiscussion(query: ResearchQuery): Promise<ResearchOutcome>;
}

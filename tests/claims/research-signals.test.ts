import { describe, expect, it } from "vitest";

import { suggestDimensionFromResearchResult } from "@/lib/claims/research-signals";
import type { ResearchResult } from "@/lib/research/types";

function result(overrides: Partial<ResearchResult>): ResearchResult {
  return {
    sourceType: "official_organization",
    sourceUrl: "https://example.org",
    sourceDomain: "example.org",
    authorityLevel: "unknown",
    retrievedAt: "2026-01-01T00:00:00Z",
    extractedFields: {},
    confidence: 30,
    excerpt: null,
    contentHash: "abc",
    warnings: [],
    connectorName: "native.readPublicPage",
    ...overrides,
  };
}

describe("suggestDimensionFromResearchResult", () => {
  it("never suggests anything above partially_supported", () => {
    const suggestion = suggestDimensionFromResearchResult(result({ sourceType: "official_organization", confidence: 100 }));
    expect(suggestion?.status).toBe("partially_supported");
  });

  it("maps an official-organization page to organization_relationship", () => {
    expect(suggestDimensionFromResearchResult(result({ sourceType: "official_organization" }))?.dimension).toBe("organization_relationship");
  });

  it("never produces a dimension for a public-discussion (social) source — spec section 13", () => {
    expect(suggestDimensionFromResearchResult(result({ sourceType: "public_discussion" }))).toBeNull();
  });

  it("never produces a dimension for a low-confidence result", () => {
    expect(suggestDimensionFromResearchResult(result({ sourceType: "official_organization", confidence: 5 }))).toBeNull();
  });

  it("never produces a dimension for web_search or other", () => {
    expect(suggestDimensionFromResearchResult(result({ sourceType: "web_search" }))).toBeNull();
    expect(suggestDimensionFromResearchResult(result({ sourceType: "other" }))).toBeNull();
  });
});

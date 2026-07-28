/**
 * Crossref REST API connector (spec section 1) — public scholarly-metadata
 * registry, no key required. Applies to `publication`-eligible claims and
 * to any claim whose URL is a DOI link, independent of item_type (see
 * claim-eligibility.ts's note on why "publication" has no dedicated
 * portfolio item type).
 */

import { safeFetch } from "@/lib/osint/safe-fetch";
import { publicationAuthorMatch, titleSimilarity } from "@/lib/osint/matching";
import type { ClaimInput, Connector, ConnectorOutcome, NormalizedEvidence } from "@/lib/osint/types";

const DOI_PATTERN = /10\.\d{4,9}\/\S+/i;

function extractDoi(claim: ClaimInput): string | null {
  if (!claim.url) return null;
  const match = DOI_PATTERN.exec(claim.url);
  return match ? match[0].replace(/[.,;]+$/, "") : null;
}

type CrossrefWork = {
  title?: string[];
  author?: { given?: string; family?: string }[];
  "container-title"?: string[];
  DOI?: string;
  published?: { "date-parts"?: number[][] };
};

function publishedDate(work: CrossrefWork): string | null {
  const parts = work.published?.["date-parts"]?.[0];
  if (!parts || parts.length === 0) return null;
  const [year, month = 1, day = 1] = parts;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function toEvidence(work: CrossrefWork, claim: ClaimInput): NormalizedEvidence {
  const title = work.title?.[0] ?? "";
  const authorMatch = publicationAuthorMatch(claim.studentDisplayName, work.author ?? []);
  const titleScore = titleSimilarity(claim.title, title);

  return {
    sourceType: "crossref",
    sourceUrl: work.DOI ? `https://doi.org/${work.DOI}` : (claim.url ?? "https://search.crossref.org"),
    sourceDomain: "doi.org",
    authorityLevel: "trusted_registry",
    extractedFields: {
      title,
      containerTitle: work["container-title"]?.[0] ?? null,
      doi: work.DOI ?? null,
      publishedDate: publishedDate(work),
      authorMatch,
      titleSimilarity: Math.round(titleScore * 100) / 100,
    },
    confidence: Math.round((authorMatch ? 60 : 0) + titleScore * 40),
    retrievedAt: new Date().toISOString(),
  };
}

export const crossrefConnector: Connector = {
  name: "crossref",
  applies(claim: ClaimInput): boolean {
    return claim.claimType === "publication" || Boolean(extractDoi(claim));
  },
  async run(claim: ClaimInput): Promise<ConnectorOutcome> {
    const doi = extractDoi(claim);
    const mailto = process.env.CROSSREF_MAILTO; // optional — puts requests in Crossref's "polite pool"; never required.

    if (doi) {
      const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}${mailto ? `?mailto=${encodeURIComponent(mailto)}` : ""}`;
      const result = await safeFetch(url);
      if (result.status !== "ok") return { ok: false, reason: `Crossref lookup failed (${result.status}).` };
      try {
        const parsed = JSON.parse(result.body) as { message?: CrossrefWork };
        if (!parsed.message) return { ok: false, reason: "Crossref returned no record for this DOI." };
        return { ok: true, evidence: [toEvidence(parsed.message, claim)] };
      } catch {
        return { ok: false, reason: "Crossref returned an unparsable response." };
      }
    }

    const query = new URLSearchParams({
      "query.bibliographic": claim.title,
      "query.author": claim.studentDisplayName,
      rows: "5",
    });
    if (mailto) query.set("mailto", mailto);
    const result = await safeFetch(`https://api.crossref.org/works?${query.toString()}`);
    if (result.status !== "ok") return { ok: false, reason: `Crossref search failed (${result.status}).` };
    try {
      const parsed = JSON.parse(result.body) as { message?: { items?: CrossrefWork[] } };
      const items = parsed.message?.items ?? [];
      const evidence = items
        .map((work) => toEvidence(work, claim))
        .filter((e) => (e.extractedFields.titleSimilarity as number) >= 0.3 || e.extractedFields.authorMatch);
      if (evidence.length === 0) return { ok: false, reason: "No matching Crossref record found." };
      return { ok: true, evidence: evidence.slice(0, 3) };
    } catch {
      return { ok: false, reason: "Crossref returned an unparsable response." };
    }
  },
};

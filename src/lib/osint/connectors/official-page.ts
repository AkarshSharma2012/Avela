/**
 * Fetches the claim's own linked page (an official award, competition,
 * certification, school, nonprofit, government, or issuer page — spec
 * section 1) and extracts structured metadata plus a title/mentions check.
 * Applies to any claim with a URL — deliberately broad, since this is the
 * one connector that stands in for "official organization website" and
 * "structured metadata (JSON-LD / schema.org)" from the spec's connector
 * list at once.
 */

import { classifyPageAuthority } from "@/lib/osint/authority";
import { extractJsonLdBlocks, extractPlainText, extractTitle, pageMentions } from "@/lib/osint/connectors/html";
import { isGithubRepositoryUrl } from "@/lib/osint/connectors/github";
import { safeFetch } from "@/lib/osint/safe-fetch";
import { credentialIdMatch, extractCredentialId, titleSimilarity } from "@/lib/osint/matching";
import type { ClaimInput, Connector, ConnectorOutcome, NormalizedEvidence } from "@/lib/osint/types";

const ISSUER_JSON_LD_TYPES = new Set([
  "educationaloccupationalcredential",
  "award",
  "certification",
  "eventreservation",
  "course",
]);

function normalizeForDomainMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hasStructuredIssuerMetadata(blocks: unknown[]): { found: boolean; typeName: string | null; identifier: string | null } {
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const type = (block as { "@type"?: unknown })["@type"];
    const typeNames = Array.isArray(type) ? type : [type];
    for (const t of typeNames) {
      if (typeof t === "string" && ISSUER_JSON_LD_TYPES.has(t.toLowerCase())) {
        const identifierRaw = (block as { identifier?: unknown }).identifier;
        const identifier = typeof identifierRaw === "string" ? identifierRaw : null;
        return { found: true, typeName: t, identifier };
      }
    }
  }
  return { found: false, typeName: null, identifier: null };
}

export const officialPageConnector: Connector = {
  name: "official_page",
  applies(claim: ClaimInput): boolean {
    // A github.com repository link is handled entirely by the dedicated
    // github connector — fetching it again here as a generic web page would
    // produce a second, duplicate "github.com" evidence card (spec: "GitHub
    // appears multiple times as duplicate evidence").
    return Boolean(claim.url && !isGithubRepositoryUrl(claim.url));
  },
  async run(claim: ClaimInput): Promise<ConnectorOutcome> {
    if (!claim.url) return { ok: false, reason: "No claim URL to check." };

    const result = await safeFetch(claim.url);
    if (result.status !== "ok") {
      return { ok: false, reason: `Could not fetch the claim's linked page (${result.status}).` };
    }
    if (!result.contentType.includes("html")) {
      return { ok: false, reason: "Linked page is not an HTML document." };
    }

    const hostname = new URL(result.finalUrl).hostname;
    const jsonLd = extractJsonLdBlocks(result.body);
    const issuerMetadata = hasStructuredIssuerMetadata(jsonLd);
    const pageTitle = extractTitle(result.body);
    const plainText = extractPlainText(result.body);

    const matchesClaimedOrganizationDomain = claim.organization
      ? normalizeForDomainMatch(hostname).includes(normalizeForDomainMatch(claim.organization).slice(0, 20))
      : false;
    const claimedCredentialId = extractCredentialId(claim.description);
    const observedCredentialId = issuerMetadata.identifier;
    const credentialMatch = credentialIdMatch(claimedCredentialId, observedCredentialId);

    const authorityLevel = classifyPageAuthority({
      hostname,
      matchesClaimedOrganizationDomain,
      hasStructuredIssuerMetadata: issuerMetadata.found,
    });

    const mentionsStudent = pageMentions(plainText, claim.studentDisplayName);
    const mentionsTitle = titleSimilarity(claim.title, pageTitle ?? "") >= 0.3 || pageMentions(plainText, claim.title);

    const retrievedAt = new Date().toISOString();
    const evidence: NormalizedEvidence[] = [
      {
        sourceType: issuerMetadata.found ? "issuer_page" : "official_organization",
        sourceUrl: result.finalUrl,
        sourceDomain: hostname,
        authorityLevel,
        extractedFields: {
          pageTitle,
          mentionsStudentName: mentionsStudent,
          mentionsClaimTitle: mentionsTitle,
        },
        confidence: Math.round((mentionsStudent ? 50 : 0) + (mentionsTitle ? 50 : 0)),
        retrievedAt,
      },
    ];

    // A separate finding for the page's own structured metadata (spec section 1's
    // "structured metadata such as JSON-LD and schema.org" bullet) — same fetch,
    // no second request, but recorded distinctly so the UI can show it as its own
    // checked source and so orchestrator.ts can weight an exact structured-data
    // match (e.g. a schema.org Award naming the student) independent of the
    // page-level text-mention heuristic above.
    if (issuerMetadata.found) {
      evidence.push({
        sourceType: "structured_metadata",
        sourceUrl: result.finalUrl,
        sourceDomain: hostname,
        authorityLevel,
        extractedFields: {
          jsonLdType: issuerMetadata.typeName,
          mentionsStudentName: mentionsStudent,
          mentionsClaimTitle: mentionsTitle,
          credentialId: observedCredentialId,
          credentialIdMatch: credentialMatch,
        },
        confidence: Math.min(100, Math.round((mentionsStudent ? 60 : 0) + (mentionsTitle ? 40 : 0) + (credentialMatch ? 20 : 0))),
        retrievedAt,
      });
    }

    return { ok: true, evidence };
  },
};

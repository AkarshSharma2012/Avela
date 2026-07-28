/**
 * URL reputation provider abstraction (spec section 1). No live provider
 * is configured in this codebase — see the final report — so this ships
 * with a heuristic fallback (pattern-based, not a real reputation API) and
 * a small pluggable interface any real provider (e.g. Google Safe Browsing,
 * a commercial threat-intel API) can implement later by setting
 * `URL_REPUTATION_PROVIDER` and adding a branch in `getUrlReputationProvider`.
 * Never called with a student-typed arbitrary URL — only ever the claim's
 * own linked URL, and never exposes whatever API key a real provider needs
 * to the client (it would only ever be read from a server-only env var,
 * the same convention as GITHUB_TOKEN/CROSSREF_MAILTO in the other
 * connectors).
 */

import type { ClaimInput, Connector, ConnectorOutcome, NormalizedEvidence } from "@/lib/osint/types";

export type UrlReputationVerdict = "clean" | "suspicious" | "malicious" | "unknown";

export type UrlReputationProvider = {
  name: string;
  check(url: string): Promise<{ verdict: UrlReputationVerdict; details: string | null }>;
};

const SUSPICIOUS_PATTERNS: { test: (hostname: string, url: string) => boolean; details: string }[] = [
  { test: (hostname) => /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname), details: "Link uses a raw IP address instead of a domain name." },
  { test: (hostname) => hostname.startsWith("xn--"), details: "Link uses an internationalized (punycode) domain, a common spoofing technique." },
  { test: (hostname) => hostname.split(".").length >= 5, details: "Link uses an unusually deep subdomain chain." },
  { test: (_hostname, url) => new URL(url).username.length > 0, details: "Link embeds credentials in the URL." },
];

/**
 * Heuristic fallback — flags a small set of structurally suspicious URL
 * shapes. Deliberately conservative: it can only ever push a claim toward
 * `needs_review` via `unsafe or suspicious URL` (spec section 7), never
 * toward any positive score, and a "clean" heuristic verdict never counts
 * as reputation *confirmation* either (spec section 5: a URL check is
 * context, not proof).
 */
export const heuristicUrlReputationProvider: UrlReputationProvider = {
  name: "heuristic",
  async check(url: string) {
    let hostname: string;
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch {
      return { verdict: "suspicious", details: "Link is not a well-formed URL." };
    }
    const hit = SUSPICIOUS_PATTERNS.find((pattern) => {
      try {
        return pattern.test(hostname, url);
      } catch {
        return false;
      }
    });
    return hit ? { verdict: "suspicious", details: hit.details } : { verdict: "unknown", details: null };
  },
};

export function getUrlReputationProvider(): UrlReputationProvider {
  return heuristicUrlReputationProvider;
}

export const urlReputationConnector: Connector = {
  name: "url_reputation",
  applies(claim: ClaimInput): boolean {
    return Boolean(claim.url);
  },
  async run(claim: ClaimInput): Promise<ConnectorOutcome> {
    if (!claim.url) return { ok: false, reason: "No claim URL to check." };
    const provider = getUrlReputationProvider();
    let hostname: string;
    try {
      hostname = new URL(claim.url).hostname;
    } catch {
      return { ok: false, reason: "Claim URL is not well-formed." };
    }

    const { verdict, details } = await provider.check(claim.url);
    const evidence: NormalizedEvidence = {
      sourceType: "url_reputation",
      sourceUrl: claim.url,
      sourceDomain: hostname,
      authorityLevel: "unknown",
      extractedFields: { provider: provider.name, verdict, details },
      confidence: verdict === "unknown" ? 0 : 40,
      retrievedAt: new Date().toISOString(),
    };
    return { ok: true, evidence: [evidence] };
  },
};

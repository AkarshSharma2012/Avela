/**
 * Authority classification (spec section 5). A connector assigns the
 * authority_level for each piece of evidence it produces; this module is
 * the single place that says which levels actually count toward
 * `confirmed_by_authoritative_source` — every other signal (domain age,
 * HTTPS, a matching name, social media, or a pile of secondary sources) is
 * explicitly excluded here, not just left out by omission.
 */

import { SOCIAL_MEDIA_HOSTS } from "@/lib/verification/constants";
import type { PortfolioOsintAuthorityLevel } from "@/types/osint";

/** Only these levels can ever contribute to `hasAnyAuthoritativeSource` in scoring.ts — trusted_registry is included (e.g. an exact GitHub/Crossref/RDAP match), verified_public_profile and secondary_source never are, no matter how many of them pile up. */
const AUTHORITATIVE_LEVELS: readonly PortfolioOsintAuthorityLevel[] = ["issuer", "official_organization", "trusted_registry"];

export function isAuthoritativeLevel(level: PortfolioOsintAuthorityLevel): boolean {
  return AUTHORITATIVE_LEVELS.includes(level);
}

function stripWww(hostname: string): string {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

export function isSocialMediaDomain(hostname: string): boolean {
  const bare = stripWww(hostname.toLowerCase());
  return SOCIAL_MEDIA_HOSTS.some((host) => bare === host || bare.endsWith(`.${host}`));
}

/**
 * Classifies a page fetched by the generic official-page connector.
 * Domain suffix (.edu/.gov/.mil) or an explicit organization-domain match
 * on the claim is a signal toward `official_organization`, never enough by
 * itself to become `issuer` — only a source that structurally asserts a
 * credential/award record (structured metadata naming an issuer, or an
 * explicit issuer API) earns `issuer`. Social media is always
 * `secondary_source` at best, regardless of any other signal on the page —
 * spec section 5: "social media alone never produces
 * confirmed_by_authoritative_source."
 */
export function classifyPageAuthority(params: { hostname: string; matchesClaimedOrganizationDomain: boolean; hasStructuredIssuerMetadata: boolean }): PortfolioOsintAuthorityLevel {
  if (isSocialMediaDomain(params.hostname)) return "secondary_source";
  if (params.hasStructuredIssuerMetadata) return "issuer";
  const bare = stripWww(params.hostname.toLowerCase());
  if (params.matchesClaimedOrganizationDomain || bare.endsWith(".edu") || bare.endsWith(".gov") || bare.endsWith(".mil")) {
    return "official_organization";
  }
  return "secondary_source";
}

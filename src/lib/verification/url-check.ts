/**
 * Official-URL validation and domain classification (spec section 3B) —
 * pure, no network access. Never treats a social-media or personal page as
 * an official confirmation; trusted-domain status is only ever one input
 * toward `externally_confirmed`, and the caller must still confirm the
 * page actually supports the claim (see actions.ts's addOfficialUrl).
 */

import { SOCIAL_MEDIA_HOSTS, TRUSTED_DOMAIN_SUFFIXES, TRUSTED_ORGANIZATION_DOMAINS } from "@/lib/verification/constants";

export type UrlCheckResult =
  | { valid: false; error: string }
  | { valid: true; hostname: string; isSocialMedia: boolean; isTrustedDomain: boolean };

function stripWww(hostname: string): string {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

function isTrustedDomain(hostname: string): boolean {
  const bare = stripWww(hostname);
  if (TRUSTED_ORGANIZATION_DOMAINS.some((domain) => bare === domain || bare.endsWith(`.${domain}`))) return true;
  return TRUSTED_DOMAIN_SUFFIXES.some((suffix) => bare.endsWith(suffix));
}

function isSocialMediaHost(hostname: string): boolean {
  const bare = stripWww(hostname);
  return SOCIAL_MEDIA_HOSTS.some((host) => bare === host || bare.endsWith(`.${host}`));
}

/** Validates shape (https, well-formed) and classifies the domain — never treats social media or a personal page as official confirmation on its own. */
export function checkOfficialUrl(url: string): UrlCheckResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: "That doesn't look like a valid link." };
  }
  if (parsed.protocol !== "https:") {
    return { valid: false, error: "Official links must use https://." };
  }

  const hostname = parsed.hostname.toLowerCase();
  return {
    valid: true,
    hostname,
    isSocialMedia: isSocialMediaHost(hostname),
    isTrustedDomain: isTrustedDomain(hostname),
  };
}

/**
 * Whether an official-URL submission can qualify for `externally_confirmed`
 * on domain grounds alone — social media never qualifies, everything else
 * only qualifies alongside a human (or reviewer) confirming the page
 * actually supports the claim; this function only ever answers "is the
 * domain itself a plausible official source," never "is this confirmed."
 */
export function domainQualifiesForConfirmation(result: UrlCheckResult): boolean {
  return result.valid && !result.isSocialMedia;
}

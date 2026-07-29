/**
 * Verifier-email domain *context* checks (spec section 5). Every function
 * here is deliberately narrow: none of them prove employment, organizational
 * authority, or legitimacy on their own — they only feed
 * verifier-legitimacy.ts's classification, which itself is documented as
 * supporting evidence only.
 *
 * Real DNS lookups via node:dns/promises — no external API key needed,
 * unlike a commercial domain-intelligence service. Every lookup fails
 * closed to `false`/`null` rather than throwing, so a DNS hiccup degrades a
 * verifier straight to the safest classification (manual_review_required)
 * rather than crashing the request flow (spec section 12: "connector
 * failures do not block saving").
 *
 * DKIM is deliberately never checked here — the spec is explicit that DKIM
 * support must never be claimed unless actually observed from a received
 * signed message or a known selector, neither of which this codebase has
 * (no verifier email is ever actually sent/received by this milestone).
 */

import { resolveMx, resolveTxt } from "node:dns/promises";

import { DISPOSABLE_EMAIL_DOMAINS, FREE_EMAIL_PROVIDERS, ROLE_MAILBOX_LOCAL_PARTS } from "@/lib/verification/constants";
import { fetchDomainRegistrationContext, registrableDomainFromHostname } from "@/lib/osint/connectors/rdap";

export function extractEmailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at === -1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain || null;
}

export function extractEmailLocalPart(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at === -1) return null;
  return email.slice(0, at).trim().toLowerCase() || null;
}

export function isFreeEmailProvider(domain: string): boolean {
  return FREE_EMAIL_PROVIDERS.includes(domain.toLowerCase());
}

export function isDisposableEmailDomain(domain: string): boolean {
  return DISPOSABLE_EMAIL_DOMAINS.includes(domain.toLowerCase());
}

export function isRoleMailboxLocalPart(localPart: string): boolean {
  return ROLE_MAILBOX_LOCAL_PARTS.includes(localPart.toLowerCase());
}

export async function hasMxRecords(domain: string): Promise<boolean> {
  try {
    const records = await resolveMx(domain);
    return records.length > 0;
  } catch {
    return false;
  }
}

export async function hasSpfRecord(domain: string): Promise<boolean> {
  try {
    const records = await resolveTxt(domain);
    return records.some((chunks) => chunks.join("").toLowerCase().startsWith("v=spf1"));
  } catch {
    return false;
  }
}

export async function hasDmarcRecord(domain: string): Promise<boolean> {
  try {
    const records = await resolveTxt(`_dmarc.${domain}`);
    return records.some((chunks) => chunks.join("").toLowerCase().startsWith("v=dmarc1"));
  } catch {
    return false;
  }
}

/**
 * A light token-overlap heuristic, not a real WHOIS/brand-lookup service:
 * normalizes the organization name (drops common legal suffixes and
 * non-alphanumerics) and checks whether that normalized name appears in the
 * domain's registrable name. False negatives are expected and fine — this
 * only ever produces `organization_domain_aligned` (a positive signal),
 * never a negative one; a non-match falls through to
 * `organization_domain_unconfirmed`, which is explicitly a neutral result
 * (spec section 5: "inability to verify publicly is neutral").
 */
export function normalizeOrganizationName(organization: string): string {
  return organization
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|corporation|foundation|association|club|organization|org|company|co)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function organizationNameMatchesDomain(organization: string, domain: string): boolean {
  const normalizedOrg = normalizeOrganizationName(organization);
  if (normalizedOrg.length < 3) return false;
  const domainName = registrableDomainFromHostname(domain).split(".")[0] ?? "";
  return domainName.includes(normalizedOrg) || normalizedOrg.includes(domainName);
}

export type DomainContextResult = {
  domain: string;
  hasMx: boolean;
  hasSpf: boolean;
  hasDmarc: boolean;
  isFreeEmailProvider: boolean;
  isDisposable: boolean;
  isRoleMailbox: boolean;
  domainRegisteredAt: string | null;
  organizationDomainMatch: boolean;
};

/** One place that gathers every context signal for a verifier email — never throws; every sub-check already fails closed on its own. */
export async function gatherDomainContext(email: string, organization: string | null): Promise<DomainContextResult | null> {
  const domain = extractEmailDomain(email);
  const localPart = extractEmailLocalPart(email);
  if (!domain || !localPart) return null;

  const [hasMx, hasSpf, hasDmarc, registration] = await Promise.all([
    hasMxRecords(domain),
    hasSpfRecord(domain),
    hasDmarcRecord(domain),
    fetchDomainRegistrationContext(domain),
  ]);

  return {
    domain,
    hasMx,
    hasSpf,
    hasDmarc,
    isFreeEmailProvider: isFreeEmailProvider(domain),
    isDisposable: isDisposableEmailDomain(domain),
    isRoleMailbox: isRoleMailboxLocalPart(localPart),
    domainRegisteredAt: registration?.registeredAt ?? null,
    organizationDomainMatch: organization ? organizationNameMatchesDomain(organization, domain) : false,
  };
}

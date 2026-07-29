/**
 * ICANN RDAP connector (spec section 1) — domain registration *context*
 * only. Deliberately never contributes to `hasAnyAuthoritativeSource` or
 * any positive score line in orchestrator.ts: spec section 5 is explicit
 * that "domain age alone never verifies a claim," so this connector's
 * authority_level is hardcoded to `unknown` regardless of what it finds,
 * and its evidence is surfaced to the student only as background
 * ("this domain has been registered since X"), never as support.
 *
 * Queries the public rdap.org bootstrap redirector, which resolves to the
 * correct registry RDAP server for any TLD without this connector needing
 * its own bootstrap-registry logic.
 */

import { safeFetch } from "@/lib/osint/safe-fetch";
import type { ClaimInput, Connector, ConnectorOutcome, NormalizedEvidence } from "@/lib/osint/types";

export function registrableDomain(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const parts = hostname.split(".");
    return parts.length >= 2 ? parts.slice(-2).join(".") : hostname;
  } catch {
    return null;
  }
}

/** Same treatment for a bare domain string (no scheme) rather than a full URL — used by verifier-legitimacy.ts, which has an email domain, not a URL. */
export function registrableDomainFromHostname(hostname: string): string {
  const parts = hostname.toLowerCase().split(".");
  return parts.length >= 2 ? parts.slice(-2).join(".") : hostname.toLowerCase();
}

type RdapResponse = {
  ldhName?: string;
  events?: { eventAction?: string; eventDate?: string }[];
  status?: string[];
};

export type DomainRegistrationContext = { domain: string; registeredAt: string | null; status: string | null };

/**
 * Shared RDAP lookup — reused by verifier-legitimacy.ts (spec section 5:
 * "collect lawful domain-registration context") so a verifier's email
 * domain gets the exact same "context only, never proof" treatment this
 * connector already gives a claim's official URL, rather than a second
 * implementation of the same lookup.
 */
export async function fetchDomainRegistrationContext(domain: string): Promise<DomainRegistrationContext | null> {
  const result = await safeFetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`);
  if (result.status !== "ok") return null;
  try {
    const parsed = JSON.parse(result.body) as RdapResponse;
    const registrationEvent = parsed.events?.find((e) => e.eventAction === "registration");
    return {
      domain: parsed.ldhName ?? domain,
      registeredAt: registrationEvent?.eventDate ?? null,
      status: (parsed.status ?? []).join(", ") || null,
    };
  } catch {
    return null;
  }
}

export const rdapConnector: Connector = {
  name: "icann_rdap",
  applies(claim: ClaimInput): boolean {
    return Boolean(claim.url && registrableDomain(claim.url));
  },
  async run(claim: ClaimInput): Promise<ConnectorOutcome> {
    const domain = claim.url ? registrableDomain(claim.url) : null;
    if (!domain) return { ok: false, reason: "No domain to look up." };

    const context = await fetchDomainRegistrationContext(domain);
    if (!context) return { ok: false, reason: "RDAP lookup failed or returned an unparsable response." };

    const evidence: NormalizedEvidence = {
      sourceType: "icann_rdap",
      sourceUrl: `https://rdap.org/domain/${encodeURIComponent(domain)}`,
      sourceDomain: domain,
      // Always `unknown` — see the module doc. Never `trusted_registry` here,
      // even though RDAP itself is a trusted registry, precisely so this
      // connector can never be mistaken for an authoritative confirmation.
      authorityLevel: "unknown",
      extractedFields: {
        domain: context.domain,
        registeredAt: context.registeredAt,
        status: context.status,
      },
      confidence: 10,
      retrievedAt: new Date().toISOString(),
    };
    return { ok: true, evidence: [evidence] };
  },
};

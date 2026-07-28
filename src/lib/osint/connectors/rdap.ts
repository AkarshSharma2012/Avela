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

function registrableDomain(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const parts = hostname.split(".");
    return parts.length >= 2 ? parts.slice(-2).join(".") : hostname;
  } catch {
    return null;
  }
}

type RdapResponse = {
  ldhName?: string;
  events?: { eventAction?: string; eventDate?: string }[];
  status?: string[];
};

export const rdapConnector: Connector = {
  name: "icann_rdap",
  applies(claim: ClaimInput): boolean {
    return Boolean(claim.url && registrableDomain(claim.url));
  },
  async run(claim: ClaimInput): Promise<ConnectorOutcome> {
    const domain = claim.url ? registrableDomain(claim.url) : null;
    if (!domain) return { ok: false, reason: "No domain to look up." };

    const result = await safeFetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`);
    if (result.status !== "ok") return { ok: false, reason: `RDAP lookup failed (${result.status}).` };

    try {
      const parsed = JSON.parse(result.body) as RdapResponse;
      const registrationEvent = parsed.events?.find((e) => e.eventAction === "registration");

      const evidence: NormalizedEvidence = {
        sourceType: "icann_rdap",
        sourceUrl: `https://rdap.org/domain/${encodeURIComponent(domain)}`,
        sourceDomain: domain,
        // Always `unknown` — see the module doc. Never `trusted_registry` here,
        // even though RDAP itself is a trusted registry, precisely so this
        // connector can never be mistaken for an authoritative confirmation.
        authorityLevel: "unknown",
        extractedFields: {
          domain: parsed.ldhName ?? domain,
          registeredAt: registrationEvent?.eventDate ?? null,
          status: (parsed.status ?? []).join(", ") || null,
        },
        confidence: 10,
        retrievedAt: new Date().toISOString(),
      };
      return { ok: true, evidence: [evidence] };
    } catch {
      return { ok: false, reason: "RDAP returned an unparsable response." };
    }
  },
};

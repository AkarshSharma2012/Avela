import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/osint/safe-fetch", () => ({ safeFetch: vi.fn() }));

import { safeFetch } from "@/lib/osint/safe-fetch";
import { rdapConnector } from "@/lib/osint/connectors/rdap";
import { isAuthoritativeLevel } from "@/lib/osint/authority";
import type { ClaimInput } from "@/lib/osint/types";

const mockedSafeFetch = vi.mocked(safeFetch);

const BASE_CLAIM: ClaimInput = {
  claimType: "award",
  studentDisplayName: "Jordan Smith",
  title: "Regional Science Fair Winner",
  organization: "Example Science Foundation",
  role: null,
  description: null,
  startDate: "2026-01-01",
  endDate: null,
  url: "https://example.org/awards/2026",
  connectedGithubUsername: null,
};

beforeEach(() => {
  mockedSafeFetch.mockReset();
});

describe("rdapConnector — RDAP is treated only as context, never as verification", () => {
  it("always returns authority_level unknown, even for a decades-old, very established-looking domain", async () => {
    mockedSafeFetch.mockResolvedValueOnce({
      status: "ok",
      finalUrl: "https://rdap.org/domain/example.org",
      statusCode: 200,
      contentType: "application/rdap+json",
      body: JSON.stringify({
        ldhName: "EXAMPLE.ORG",
        events: [{ eventAction: "registration", eventDate: "1995-01-01T00:00:00Z" }],
        status: ["active"],
      }),
    });

    const outcome = await rdapConnector.run(BASE_CLAIM);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.evidence).toHaveLength(1);
    expect(outcome.evidence[0]?.authorityLevel).toBe("unknown");
    expect(isAuthoritativeLevel(outcome.evidence[0]!.authorityLevel)).toBe(false);
    // The old registration date is still surfaced as context...
    expect(outcome.evidence[0]?.extractedFields.registeredAt).toBe("1995-01-01T00:00:00Z");
  });

  it("fails independently when the RDAP lookup itself fails", async () => {
    mockedSafeFetch.mockResolvedValueOnce({ status: "http_error", finalUrl: "https://rdap.org/domain/example.org", statusCode: 404 });
    const outcome = await rdapConnector.run(BASE_CLAIM);
    expect(outcome.ok).toBe(false);
  });
});

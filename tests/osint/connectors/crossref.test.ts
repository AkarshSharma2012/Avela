import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/osint/safe-fetch", () => ({ safeFetch: vi.fn() }));

import { safeFetch } from "@/lib/osint/safe-fetch";
import { crossrefConnector } from "@/lib/osint/connectors/crossref";
import type { ClaimInput } from "@/lib/osint/types";

const mockedSafeFetch = vi.mocked(safeFetch);

const BASE_CLAIM: ClaimInput = {
  claimType: "publication",
  studentDisplayName: "Jordan Smith",
  title: "A Novel Approach to Robotics Education",
  organization: null,
  role: null,
  description: null,
  startDate: "2026-01-01",
  endDate: null,
  url: null,
  connectedGithubUsername: null,
};

function jsonOk(body: unknown) {
  return { status: "ok" as const, finalUrl: "https://api.crossref.org/mock", statusCode: 200, contentType: "application/json", body: JSON.stringify(body) };
}

beforeEach(() => {
  mockedSafeFetch.mockReset();
});

describe("crossrefConnector.applies", () => {
  it("applies to publication-typed claims", () => {
    expect(crossrefConnector.applies(BASE_CLAIM)).toBe(true);
  });

  it("applies to any claim whose URL contains a DOI, regardless of claim type", () => {
    expect(crossrefConnector.applies({ ...BASE_CLAIM, claimType: "project", url: "https://doi.org/10.1234/abcd.5678" })).toBe(true);
  });

  it("does not apply to an unrelated claim with no DOI", () => {
    expect(crossrefConnector.applies({ ...BASE_CLAIM, claimType: "award", url: "https://example.com/award" })).toBe(false);
  });
});

describe("crossrefConnector.run — author/title matching", () => {
  it("matches on author and title similarity via a bibliographic search", async () => {
    mockedSafeFetch.mockResolvedValueOnce(
      jsonOk({
        message: {
          items: [
            {
              title: ["A Novel Approach to Robotics Education"],
              author: [{ given: "Jordan", family: "Smith" }],
              DOI: "10.1234/robo.edu",
              published: { "date-parts": [[2026, 1, 15]] },
            },
          ],
        },
      })
    );
    const outcome = await crossrefConnector.run(BASE_CLAIM);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.evidence[0]?.extractedFields.authorMatch).toBe(true);
    expect(outcome.evidence[0]?.authorityLevel).toBe("trusted_registry");
  });

  it("filters out results with neither a title nor an author match", async () => {
    mockedSafeFetch.mockResolvedValueOnce(
      jsonOk({
        message: {
          items: [{ title: ["Completely Unrelated Paper"], author: [{ given: "Alex", family: "Nguyen" }] }],
        },
      })
    );
    const outcome = await crossrefConnector.run(BASE_CLAIM);
    expect(outcome.ok).toBe(false);
  });

  it("looks up a DOI directly when the claim URL contains one", async () => {
    mockedSafeFetch.mockResolvedValueOnce(
      jsonOk({ message: { title: ["A Novel Approach to Robotics Education"], author: [{ given: "Jordan", family: "Smith" }], DOI: "10.1234/robo.edu" } })
    );
    const outcome = await crossrefConnector.run({ ...BASE_CLAIM, url: "https://doi.org/10.1234/robo.edu" });
    expect(outcome.ok).toBe(true);
    const requestedUrl = mockedSafeFetch.mock.calls[0]?.[0] as string;
    expect(requestedUrl).toContain("/works/");
    expect(requestedUrl).toContain(encodeURIComponent("10.1234/robo.edu"));
  });

  it("fails independently when Crossref is unreachable", async () => {
    mockedSafeFetch.mockResolvedValueOnce({ status: "timeout", finalUrl: "https://api.crossref.org/mock", statusCode: null });
    const outcome = await crossrefConnector.run(BASE_CLAIM);
    expect(outcome.ok).toBe(false);
  });
});

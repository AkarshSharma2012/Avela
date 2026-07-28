import { describe, expect, it } from "vitest";

import { officialPageConnector } from "@/lib/osint/connectors/official-page";
import type { ClaimInput } from "@/lib/osint/types";

const BASE_CLAIM: ClaimInput = {
  claimType: "project",
  studentDisplayName: "Akarsh Sharma",
  title: "Avela",
  organization: null,
  role: null,
  description: null,
  startDate: null,
  endDate: null,
  url: "https://example.org/projects/avela",
  connectedGithubUsername: null,
};

describe("officialPageConnector.applies — never duplicates the dedicated GitHub connector's evidence", () => {
  it("applies to an ordinary claim URL", () => {
    expect(officialPageConnector.applies(BASE_CLAIM)).toBe(true);
  });

  it("does not apply to a github.com repository URL — connectors/github.ts already covers it", () => {
    expect(officialPageConnector.applies({ ...BASE_CLAIM, url: "https://github.com/AkarshSharma2012/Avela" })).toBe(false);
  });

  it("does not apply when there's no URL at all", () => {
    expect(officialPageConnector.applies({ ...BASE_CLAIM, url: null })).toBe(false);
  });
});

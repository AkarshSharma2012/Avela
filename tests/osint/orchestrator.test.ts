import { describe, expect, it } from "vitest";

import { runOsintCheck } from "@/lib/osint/orchestrator";
import type { ClaimInput, Connector } from "@/lib/osint/types";
import type { OsintConsentScope } from "@/lib/osint/consent";

const CLAIM: ClaimInput = {
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

const CONSENT_SCOPE: OsintConsentScope = { fields: ["title", "url"], sourceTypes: ["official_organization"], consentedAt: "2026-01-01T00:00:00Z" };

/** A minimal in-memory stand-in for supabase-js's chainable query builder, covering exactly the shapes src/lib/osint/repository.ts issues — same "inject the dependency" approach as tests/verification/repository.test.ts. */
function createFakeSupabase() {
  let idCounter = 0;
  const tables: Record<string, Record<string, unknown>[]> = {
    portfolio_osint_checks: [],
    portfolio_osint_evidence: [],
    portfolio_osint_conflicts: [],
  };

  function insert(table: string, row: Record<string, unknown>) {
    const id = `${table}-${idCounter++}`;
    const saved = { id, ...row };
    tables[table]!.push(saved);
    const promise = Promise.resolve({ error: null });
    return Object.assign(promise, {
      select: () => ({ single: async () => ({ data: saved, error: null }) }),
    });
  }

  function selectChain(table: string, predicate: (row: Record<string, unknown>) => boolean = () => true) {
    const filters: ((row: Record<string, unknown>) => boolean)[] = [predicate];
    const chain = {
      eq: (field: string, value: unknown) => {
        filters.push((row) => row[field] === value);
        return chain;
      },
      neq: (field: string, value: unknown) => {
        filters.push((row) => row[field] !== value);
        return chain;
      },
      in: (field: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[field]));
        return chain;
      },
      order: () => chain,
      limit: async () => ({ data: tables[table]!.filter((row) => filters.every((f) => f(row))), error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: tables[table]!.filter((row) => filters.every((f) => f(row))), error: null }),
    };
    return chain;
  }

  function updateChain(table: string, patch: Record<string, unknown>) {
    const filters: ((row: Record<string, unknown>) => boolean)[] = [];
    const chain = {
      eq: (field: string, value: unknown) => {
        filters.push((row) => row[field] === value);
        return chain;
      },
      then: (resolve: (v: { error: null }) => void) => {
        for (const row of tables[table]!) {
          if (filters.every((f) => f(row))) Object.assign(row, patch);
        }
        resolve({ error: null });
      },
    };
    return chain;
  }

  const supabase = {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => insert(table, row),
      select: () => selectChain(table),
      update: (patch: Record<string, unknown>) => updateChain(table, patch),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  return { supabase, tables };
}

function makeConnector(name: Connector["name"], behavior: "ok" | "fail" | "throw", evidence: unknown[] = []): Connector {
  return {
    name,
    applies: () => true,
    async run() {
      if (behavior === "throw") throw new Error(`${name} exploded`);
      if (behavior === "fail") return { ok: false, reason: `${name} could not be checked` };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { ok: true, evidence: evidence as any };
    },
  };
}

describe("runOsintCheck — connector partial failure never fails the whole check", () => {
  it("completes with whatever evidence succeeded, recording the others as failures", async () => {
    const { supabase } = createFakeSupabase();
    const connectors: Connector[] = [
      makeConnector("official_page", "throw"),
      makeConnector("github", "fail"),
      makeConnector("crossref", "ok", [
        {
          sourceType: "crossref",
          sourceUrl: "https://doi.org/10.1234/x",
          sourceDomain: "doi.org",
          authorityLevel: "trusted_registry",
          extractedFields: { authorMatch: true, titleSimilarity: 0.9 },
          confidence: 90,
          retrievedAt: new Date().toISOString(),
        },
      ]),
    ];

    const { result, error } = await runOsintCheck({
      supabase,
      userId: "user-1",
      itemId: "item-1",
      claim: CLAIM,
      consentScope: CONSENT_SCOPE,
      existingVerification: null,
      connectors,
    });

    expect(error).toBeNull();
    expect(result?.check.status).toBe("completed");
    expect(result?.connectorFailures).toHaveLength(2);
    expect(result?.connectorFailures.map((f) => f.connector).sort()).toEqual(["github", "official_page"]);
    expect(result?.evidence).toHaveLength(1);
    expect(result?.evidence[0]?.source_type).toBe("crossref");
  });
});

describe("runOsintCheck — domain age alone (RDAP) can never confirm a claim", () => {
  it("scores an RDAP-only result as unable to verify, never confirmed", async () => {
    const { supabase } = createFakeSupabase();
    const connectors: Connector[] = [
      makeConnector("icann_rdap", "ok", [
        {
          sourceType: "icann_rdap",
          sourceUrl: "https://rdap.org/domain/example.org",
          sourceDomain: "example.org",
          authorityLevel: "unknown",
          extractedFields: { domain: "example.org", registeredAt: "1995-01-01T00:00:00Z" },
          confidence: 10,
          retrievedAt: new Date().toISOString(),
        },
      ]),
    ];

    const { result } = await runOsintCheck({
      supabase,
      userId: "user-1",
      itemId: "item-1",
      claim: CLAIM,
      consentScope: CONSENT_SCOPE,
      existingVerification: null,
      connectors,
    });

    expect(result?.check.final_support_level).not.toBe("confirmed_by_authoritative_source");
    expect(result?.check.score).toBe(0);
  });
});

describe("runOsintCheck — URL reputation alone can never confirm a claim", () => {
  it("scores a url_reputation-only result as unable to verify, never confirmed", async () => {
    const { supabase } = createFakeSupabase();
    const connectors: Connector[] = [
      makeConnector("url_reputation", "ok", [
        {
          sourceType: "url_reputation",
          sourceUrl: "https://example.org/awards/2026",
          sourceDomain: "example.org",
          authorityLevel: "unknown",
          extractedFields: { provider: "heuristic", verdict: "unknown", details: null },
          confidence: 0,
          retrievedAt: new Date().toISOString(),
        },
      ]),
    ];

    const { result } = await runOsintCheck({
      supabase,
      userId: "user-1",
      itemId: "item-1",
      claim: CLAIM,
      consentScope: CONSENT_SCOPE,
      existingVerification: null,
      connectors,
    });

    expect(result?.check.final_support_level).not.toBe("confirmed_by_authoritative_source");
    expect(result?.check.score).toBe(0);
  });
});

const GITHUB_CLAIM: ClaimInput = {
  ...CLAIM,
  claimType: "project",
  studentDisplayName: "Akarsh Sharma",
  title: "Avela",
  organization: null,
  url: "https://github.com/AkarshSharma2012/Avela",
  connectedGithubUsername: "AkarshSharma2012",
};

function githubEvidence(overrides: Record<string, unknown>) {
  return {
    sourceType: "github",
    sourceUrl: "https://github.com/AkarshSharma2012/Avela",
    sourceDomain: "github.com",
    authorityLevel: "unknown",
    extractedFields: {
      repoFullName: "AkarshSharma2012/Avela",
      ownerLogin: "AkarshSharma2012",
      connectedUsername: "AkarshSharma2012",
      ownerLoginMatch: false,
      contributorLoginMatch: false,
      commitAuthorLoginMatch: false,
      orgMemberMatch: false,
      datesAlign: false,
      readmeOrDescriptionMatch: false,
      deploymentUrlMatch: false,
      titleOnlyMatch: false,
      displayNameOnlyMatch: false,
      connectedUsernameMissing: false,
      ownershipUnclear: false,
      ...overrides,
    },
    confidence: 50,
    retrievedAt: new Date().toISOString(),
  };
}

describe("runOsintCheck — GitHub repository ownership", () => {
  it("owner + contributor + commit-author match strongly supports the claim without ever hitting Needs review for an ambiguous/common name", async () => {
    const { supabase } = createFakeSupabase();
    const connectors: Connector[] = [
      makeConnector("github", "ok", [
        githubEvidence({ ownerLoginMatch: true, contributorLoginMatch: true, commitAuthorLoginMatch: true, readmeOrDescriptionMatch: true }),
      ]),
    ];

    // "Jo Li" is structurally ambiguous (two very short tokens) — without the
    // GitHub-ownership-resolved gate in orchestrator.ts, this alone would add
    // "ambiguous_student_name" and force Needs review regardless of how
    // strong the repository evidence is.
    const { result } = await runOsintCheck({
      supabase,
      userId: "user-1",
      itemId: "item-1",
      claim: { ...GITHUB_CLAIM, studentDisplayName: "Jo Li" },
      consentScope: CONSENT_SCOPE,
      existingVerification: null,
      connectors,
    });

    expect(result?.check.final_support_level).toBe("strongly_supported");
    expect(result?.conflicts.some((c) => /name is common/i.test(c.respectful_message))).toBe(false);
  });

  it("GitHub ownership evidence alone never reaches confirmed_by_authoritative_source, even fully matched", async () => {
    const { supabase } = createFakeSupabase();
    const connectors: Connector[] = [
      makeConnector("github", "ok", [
        githubEvidence({
          ownerLoginMatch: true,
          contributorLoginMatch: true,
          commitAuthorLoginMatch: true,
          readmeOrDescriptionMatch: true,
          datesAlign: true,
          deploymentUrlMatch: true,
        }),
      ]),
    ];

    const { result } = await runOsintCheck({
      supabase,
      userId: "user-1",
      itemId: "item-1",
      claim: GITHUB_CLAIM,
      consentScope: CONSENT_SCOPE,
      existingVerification: null,
      connectors,
    });

    expect(result?.check.final_support_level).not.toBe("confirmed_by_authoritative_source");
  });

  it("repository existence alone (no ownership match) can never confirm and is routed to manual review, not silently accepted", async () => {
    const { supabase } = createFakeSupabase();
    // Connected username present, but nothing about the repo ties to it — exactly what connectors/github.ts sets ownershipUnclear for.
    const connectors: Connector[] = [makeConnector("github", "ok", [githubEvidence({ ownershipUnclear: true })])];

    const { result } = await runOsintCheck({
      supabase,
      userId: "user-1",
      itemId: "item-1",
      claim: GITHUB_CLAIM,
      consentScope: CONSENT_SCOPE,
      existingVerification: null,
      connectors,
    });

    expect(result?.check.final_support_level).toBe("needs_review");
    expect(result?.conflicts.some((c) => c.field_name === "repository_ownership")).toBe(true);
  });

  it("a missing connected GitHub username prompts to connect one, not a 'the name is common' message", async () => {
    const { supabase } = createFakeSupabase();
    const connectors: Connector[] = [makeConnector("github", "ok", [githubEvidence({ connectedUsername: null, connectedUsernameMissing: true })])];

    const { result } = await runOsintCheck({
      supabase,
      userId: "user-1",
      itemId: "item-1",
      claim: { ...GITHUB_CLAIM, connectedGithubUsername: null },
      consentScope: CONSENT_SCOPE,
      existingVerification: null,
      connectors,
    });

    expect(result?.check.final_support_level).toBe("needs_review");
    expect(result?.conflicts.some((c) => /connect or enter your github username/i.test(c.respectful_message))).toBe(true);
    expect(result?.conflicts.some((c) => /name is common/i.test(c.respectful_message))).toBe(false);
  });

  it("display-name/title-only matches stay weak and do not resolve ownership or suppress the ambiguous-name review", async () => {
    const { supabase } = createFakeSupabase();
    const connectors: Connector[] = [
      makeConnector("github", "ok", [
        githubEvidence({ connectedUsername: null, connectedUsernameMissing: true, displayNameOnlyMatch: true, titleOnlyMatch: true }),
      ]),
    ];

    const { result } = await runOsintCheck({
      supabase,
      userId: "user-1",
      itemId: "item-1",
      claim: { ...GITHUB_CLAIM, studentDisplayName: "Jo", connectedGithubUsername: null },
      consentScope: CONSENT_SCOPE,
      existingVerification: null,
      connectors,
    });

    expect(result?.check.final_support_level).toBe("needs_review");
    expect(result?.check.score).toBeLessThan(45);
  });
});

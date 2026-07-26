import { describe, expect, it, vi } from "vitest";

import type { RawOpportunityRecordInput } from "@/lib/opportunities/adapters/types";
import type {
  DedupeCandidateRow,
  IngestionRepository,
  NewOpportunityFields,
  OpportunityPatch,
} from "@/lib/opportunities/ingestion-repository";
import { runIngestion, type IngestionSourceConfig } from "@/lib/opportunities/ingestion-runner";
import type { DnsLookupFn } from "@/lib/opportunities/url-safety";
import type { OpportunitySourceTrustLevel } from "@/types/database";

const NOW = new Date("2026-07-26T12:00:00Z");
const PUBLIC_DNS: DnsLookupFn = async () => ({ address: "93.184.216.34", family: 4 });

function makeResponse(status: number, headers: Record<string, string> = {}, body = ""): Response {
  return {
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => body,
  } as unknown as Response;
}

/** Always reports the requested page (and any "apply" link on it) as reachable — the default happy path for tests that aren't specifically exercising URL-safety edge cases. */
const ALWAYS_WORKING_FETCH = vi.fn(async () => makeResponse(200, {}, "ok"));

class FakeRepository implements IngestionRepository {
  opportunities = new Map<string, NewOpportunityFields & { id: string }>();
  sourceLinks = new Map<string, { sourceId: string; sourceUrl: string; isPrimary: boolean }[]>();
  reviewEntries: { opportunityId: string; reason: string }[] = [];
  rawRecords: unknown[] = [];
  runs = new Map<string, { status: string }>();
  private nextId = 1;
  private sourceTrustLevels: Map<string, OpportunitySourceTrustLevel>;

  constructor(sourceTrustLevels: Record<string, OpportunitySourceTrustLevel> = {}) {
    this.sourceTrustLevels = new Map(Object.entries(sourceTrustLevels));
  }

  async createIngestionRun(): Promise<string> {
    const id = `run-${this.nextId++}`;
    this.runs.set(id, { status: "running" });
    return id;
  }

  async completeIngestionRun(runId: string, result: { status: "completed" | "failed" }): Promise<void> {
    this.runs.set(runId, { status: result.status });
  }

  async insertRawRecord(input: unknown): Promise<void> {
    this.rawRecords.push(input);
  }

  async findDedupeCandidates({
    organization,
    applicationUrl,
  }: {
    organization: string;
    applicationUrl: string;
  }): Promise<DedupeCandidateRow[]> {
    return [...this.opportunities.values()]
      .filter((o) => o.organization === organization || o.application_url === applicationUrl)
      .map((o) => {
        const links = this.sourceLinks.get(o.id) ?? [];
        const primary = links.find((l) => l.isPrimary) ?? null;
        return {
          id: o.id,
          title: o.title,
          organization: o.organization,
          canonicalUrl: null,
          applicationUrl: o.application_url,
          sourceUrl: o.source_url,
          applicationDeadline: o.application_deadline,
          primarySourceId: primary?.sourceId ?? null,
          primarySourceTrustLevel: primary ? (this.sourceTrustLevels.get(primary.sourceId) ?? null) : null,
          sourceLinkCount: links.length,
        };
      });
  }

  async insertOpportunity(fields: NewOpportunityFields): Promise<string> {
    const id = `opp-${this.nextId++}`;
    this.opportunities.set(id, { ...fields, id });
    return id;
  }

  async updateOpportunity(id: string, patch: OpportunityPatch): Promise<void> {
    const existing = this.opportunities.get(id);
    if (!existing) throw new Error(`No opportunity ${id}`);
    this.opportunities.set(id, { ...existing, ...patch });
  }

  async upsertSourceLink({
    opportunityId,
    sourceId,
    sourceUrl,
    isPrimary,
  }: {
    opportunityId: string;
    sourceId: string;
    sourceUrl: string;
    isPrimary: boolean;
  }): Promise<void> {
    const links = this.sourceLinks.get(opportunityId) ?? [];
    if (isPrimary) {
      for (const link of links) {
        if (link.sourceId !== sourceId) link.isPrimary = false;
      }
    }
    const existing = links.find((l) => l.sourceId === sourceId);
    if (existing) {
      existing.sourceUrl = sourceUrl;
      existing.isPrimary = isPrimary;
    } else {
      links.push({ sourceId, sourceUrl, isPrimary });
    }
    this.sourceLinks.set(opportunityId, links);
  }

  async insertReviewQueueEntries(entries: { opportunityId: string; reason: string }[]): Promise<void> {
    this.reviewEntries.push(...entries);
  }
}

function makeSource(overrides: Partial<IngestionSourceConfig> = {}): IngestionSourceConfig {
  return {
    id: "source-a",
    organizationHint: "Example Organization",
    trustLevel: "high",
    defaultOpportunityType: "internship",
    defaultFormat: "in_person",
    ...overrides,
  };
}

function makeRecord(overrides: Partial<RawOpportunityRecordInput> = {}): RawOpportunityRecordInput {
  return {
    sourceUrl: "https://example.gov/program",
    rawTitle: null,
    rawContent:
      "<html><head><title>Test Fellowship Program</title></head><body><p>Open to high school students. Applications due March 15, 2027. This program is free.</p></body></html>",
    rawMetadata: {},
    contentHash: "hash-1",
    fetchedAt: NOW.toISOString(),
    ...overrides,
  };
}

function fakeAdapter(records: RawOpportunityRecordInput[], sourceId = "source-a") {
  return {
    sourceId,
    async discover() {
      return records;
    },
    async fetchDetails() {
      throw new Error("not used in these tests");
    },
  };
}

describe("runIngestion — validation", () => {
  it("rejects a record with no extractable title", async () => {
    const repository = new FakeRepository({ "source-a": "high" });
    const record = makeRecord({
      rawContent: "<html><body><p>No title anywhere, just some prose about a program.</p></body></html>",
    });
    const summary = await runIngestion({
      source: makeSource(),
      adapter: fakeAdapter([record]),
      repository,
      dryRun: false,
      now: NOW,
      fetchImpl: ALWAYS_WORKING_FETCH,
      dnsLookupImpl: PUBLIC_DNS,
    });

    expect(summary.itemsRejected).toBe(1);
    expect(summary.itemsCreated).toBe(0);
    expect(repository.opportunities.size).toBe(0);
  });

  it("rejects a brand-new record whose exact deadline has already passed", async () => {
    const repository = new FakeRepository({ "source-a": "high" });
    const record = makeRecord({
      rawContent:
        "<html><head><title>Past Program</title></head><body><p>Open to high school students. Applications due January 1, 2026. Free.</p></body></html>",
    });
    const summary = await runIngestion({
      source: makeSource(),
      adapter: fakeAdapter([record]),
      repository,
      dryRun: false,
      now: NOW,
      fetchImpl: ALWAYS_WORKING_FETCH,
      dnsLookupImpl: PUBLIC_DNS,
    });

    expect(summary.itemsRejected).toBe(1);
    expect(summary.records[0].rejectionReason).toMatch(/deadline/i);
  });

  it("rejects a brand-new record whose application status is clearly closed (derived from a passed deadline)", async () => {
    const repository = new FakeRepository({ "source-a": "high" });
    const record = makeRecord({
      rawContent:
        "<html><head><title>Closed Program</title></head><body><p>High school students. Applications due January 1, 2026.</p></body></html>",
    });
    const summary = await runIngestion({
      source: makeSource(),
      adapter: fakeAdapter([record]),
      repository,
      dryRun: false,
      now: NOW,
      fetchImpl: ALWAYS_WORKING_FETCH,
      dnsLookupImpl: PUBLIC_DNS,
    });

    expect(summary.itemsRejected).toBe(1);
  });

  it("does not reject an unknown deadline — queues it for review and still stores it", async () => {
    const repository = new FakeRepository({ "source-a": "high" });
    const record = makeRecord({
      rawContent: "<html><head><title>Mystery Timeline Program</title></head><body><p>High school students.</p></body></html>",
    });
    const summary = await runIngestion({
      source: makeSource(),
      adapter: fakeAdapter([record]),
      repository,
      dryRun: false,
      now: NOW,
      fetchImpl: ALWAYS_WORKING_FETCH,
      dnsLookupImpl: PUBLIC_DNS,
    });

    expect(summary.itemsRejected).toBe(0);
    expect(summary.itemsCreated).toBe(1);
    expect(summary.itemsQueued).toBe(1);
    expect(repository.reviewEntries.some((e) => e.reason === "unknown_deadline")).toBe(true);
  });
});

describe("runIngestion — real-page noise (regression)", () => {
  // Confirmed live against NIST's actual SHIP page: a <nav> sidebar
  // listing sibling programs ("Middle School Science Teachers...") was
  // misread as the (high-school-only) program's own eligibility, and an
  // unrelated "program dates" line near the word "open" was misread as
  // the application deadline. Both are reproduced here synthetically.
  const NAV_HEAVY_RECORD = makeRecord({
    rawContent: `<html><head><title>Summer High School Internship Program</title></head>
      <body>
        <nav>
          <a href="/gmse">Graduate Students (GMSE)</a>
          <a href="/msst">Middle School Science Teachers (Summer Institute)</a>
        </nav>
        <main>
          <p>2026 Program Dates: June 22 - Aug 7, 2026. Applications for next cycle are expected to open in mid-October.</p>
          <p>Eligibility and Requirements: The applicant must be a high school junior or senior at the time of application.</p>
          <p>This is an unpaid internship.</p>
        </main>
      </body></html>`,
  });

  it("does not misread a <nav> sidebar's sibling-program links as this program's own grade eligibility", async () => {
    const repository = new FakeRepository({ "source-a": "high" });
    const summary = await runIngestion({
      source: makeSource(),
      adapter: fakeAdapter([NAV_HEAVY_RECORD]),
      repository,
      dryRun: false,
      now: NOW,
      fetchImpl: ALWAYS_WORKING_FETCH,
      dnsLookupImpl: PUBLIC_DNS,
    });

    expect(summary.itemsCreated).toBe(1);
    const stored = [...repository.opportunities.values()][0];
    expect(stored.min_grade).toBe(9);
    expect(stored.max_grade).toBe(12);
  });

  it("does not misread an unrelated nearby date (program dates) as the application deadline", async () => {
    const repository = new FakeRepository({ "source-a": "high" });
    const summary = await runIngestion({
      source: makeSource(),
      adapter: fakeAdapter([NAV_HEAVY_RECORD]),
      repository,
      dryRun: false,
      now: NOW,
      fetchImpl: ALWAYS_WORKING_FETCH,
      dnsLookupImpl: PUBLIC_DNS,
    });

    expect(summary.itemsCreated).toBe(1);
    const stored = [...repository.opportunities.values()][0];
    expect(stored.application_deadline).toBeNull();
    expect(stored.deadline_status).toBe("unknown");
    expect(summary.itemsQueued).toBe(1);
    expect(repository.reviewEntries.some((e) => e.reason === "unknown_deadline")).toBe(true);
  });
});

describe("runIngestion — URL safety", () => {
  it("falls back to the source page URL when the extracted apply-link is a private-network address, and flags it for review", async () => {
    const repository = new FakeRepository({ "source-a": "high" });
    const record = makeRecord({
      rawContent:
        '<html><head><title>Program</title></head><body><p>High school students. Applications due March 15, 2027. Free.</p><a href="http://169.254.169.254/apply">Apply Now</a></body></html>',
    });

    const summary = await runIngestion({
      source: makeSource(),
      adapter: fakeAdapter([record]),
      repository,
      dryRun: false,
      now: NOW,
      fetchImpl: ALWAYS_WORKING_FETCH,
      dnsLookupImpl: PUBLIC_DNS,
    });

    expect(summary.itemsCreated).toBe(1);
    const stored = [...repository.opportunities.values()][0];
    expect(stored.application_url).toBe(record.sourceUrl);
    expect(repository.reviewEntries.some((e) => e.reason === "broken_application_url")).toBe(true);
  });

  it("falls back to the source page URL when the extracted apply-link is broken (404)", async () => {
    const repository = new FakeRepository({ "source-a": "high" });
    const record = makeRecord({
      rawContent:
        '<html><head><title>Program</title></head><body><p>High school students. Applications due March 15, 2027. Free.</p><a href="https://example.gov/apply-broken">Apply Now</a></body></html>',
    });

    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("apply-broken")) return makeResponse(404);
      return makeResponse(200, {}, "ok");
    });

    const summary = await runIngestion({
      source: makeSource(),
      adapter: fakeAdapter([record]),
      repository,
      dryRun: false,
      now: NOW,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      dnsLookupImpl: PUBLIC_DNS,
    });

    expect(summary.itemsCreated).toBe(1);
    const stored = [...repository.opportunities.values()][0];
    expect(stored.application_url).toBe(record.sourceUrl);
  });
});

describe("runIngestion — dry run", () => {
  it("performs zero writes and reports what would happen", async () => {
    const repository = new FakeRepository({ "source-a": "high" });
    const createSpy = vi.spyOn(repository, "createIngestionRun");
    const insertOppSpy = vi.spyOn(repository, "insertOpportunity");
    const insertRawSpy = vi.spyOn(repository, "insertRawRecord");
    const upsertLinkSpy = vi.spyOn(repository, "upsertSourceLink");

    const summary = await runIngestion({
      source: makeSource(),
      adapter: fakeAdapter([makeRecord()]),
      repository,
      dryRun: true,
      now: NOW,
      fetchImpl: ALWAYS_WORKING_FETCH,
      dnsLookupImpl: PUBLIC_DNS,
    });

    expect(summary.itemsCreated).toBe(1); // reported in the plan
    expect(repository.opportunities.size).toBe(0); // but nothing was actually written
    expect(createSpy).not.toHaveBeenCalled();
    expect(insertOppSpy).not.toHaveBeenCalled();
    expect(insertRawSpy).not.toHaveBeenCalled();
    expect(upsertLinkSpy).not.toHaveBeenCalled();
  });
});

describe("runIngestion — ingestion-run counters", () => {
  it("tallies found/created/rejected accurately across a mixed batch", async () => {
    const repository = new FakeRepository({ "source-a": "high" });
    const good = makeRecord({ sourceUrl: "https://example.gov/good" });
    const bad = makeRecord({
      sourceUrl: "https://example.gov/bad",
      rawContent: "<html><body>No title here.</body></html>",
    });

    const summary = await runIngestion({
      source: makeSource(),
      adapter: fakeAdapter([good, bad]),
      repository,
      dryRun: false,
      now: NOW,
      fetchImpl: ALWAYS_WORKING_FETCH,
      dnsLookupImpl: PUBLIC_DNS,
    });

    expect(summary.itemsFound).toBe(2);
    expect(summary.itemsCreated).toBe(1);
    expect(summary.itemsRejected).toBe(1);
  });
});

describe("runIngestion — deduplication and idempotency", () => {
  it("is idempotent: rerunning the same source updates the existing record instead of duplicating it", async () => {
    const repository = new FakeRepository({ "source-a": "high" });
    const record = makeRecord();

    const first = await runIngestion({
      source: makeSource(),
      adapter: fakeAdapter([record]),
      repository,
      dryRun: false,
      now: NOW,
      fetchImpl: ALWAYS_WORKING_FETCH,
      dnsLookupImpl: PUBLIC_DNS,
    });
    expect(first.itemsCreated).toBe(1);
    expect(repository.opportunities.size).toBe(1);

    const second = await runIngestion({
      source: makeSource(),
      adapter: fakeAdapter([record]),
      repository,
      dryRun: false,
      now: NOW,
      fetchImpl: ALWAYS_WORKING_FETCH,
      dnsLookupImpl: PUBLIC_DNS,
    });
    expect(second.itemsCreated).toBe(0);
    expect(second.itemsUpdated).toBe(1);
    expect(repository.opportunities.size).toBe(1);
  });

  it("collapses the same opportunity reported by two different sources into one canonical record with two source links", async () => {
    const repository = new FakeRepository({ "source-a": "high", "source-b": "medium" });
    const record = makeRecord();

    await runIngestion({
      source: makeSource({ id: "source-a", trustLevel: "high" }),
      adapter: fakeAdapter([record], "source-a"),
      repository,
      dryRun: false,
      now: NOW,
      fetchImpl: ALWAYS_WORKING_FETCH,
      dnsLookupImpl: PUBLIC_DNS,
    });

    const second = await runIngestion({
      source: makeSource({ id: "source-b", trustLevel: "medium" }),
      adapter: fakeAdapter([record], "source-b"),
      repository,
      dryRun: false,
      now: NOW,
      fetchImpl: ALWAYS_WORKING_FETCH,
      dnsLookupImpl: PUBLIC_DNS,
    });

    expect(second.itemsCreated).toBe(0);
    expect(second.itemsUpdated).toBe(1);
    expect(repository.opportunities.size).toBe(1);

    const [opportunityId] = repository.opportunities.keys();
    expect(repository.sourceLinks.get(opportunityId)).toHaveLength(2);
  });

  it("prefers the official (higher-trust) source as primary, regardless of ingestion order", async () => {
    const repository = new FakeRepository({ "source-a": "medium", "source-b": "high" });
    const record = makeRecord();

    await runIngestion({
      source: makeSource({ id: "source-a", trustLevel: "medium" }),
      adapter: fakeAdapter([record], "source-a"),
      repository,
      dryRun: false,
      now: NOW,
      fetchImpl: ALWAYS_WORKING_FETCH,
      dnsLookupImpl: PUBLIC_DNS,
    });

    await runIngestion({
      source: makeSource({ id: "source-b", trustLevel: "high" }),
      adapter: fakeAdapter([record], "source-b"),
      repository,
      dryRun: false,
      now: NOW,
      fetchImpl: ALWAYS_WORKING_FETCH,
      dnsLookupImpl: PUBLIC_DNS,
    });

    const [opportunityId] = repository.opportunities.keys();
    const links = repository.sourceLinks.get(opportunityId) ?? [];
    const primary = links.find((l) => l.isPrimary);
    expect(primary?.sourceId).toBe("source-b");
  });
});

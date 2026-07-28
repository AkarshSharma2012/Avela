import { describe, expect, it } from "vitest";

import { computeContentHash, computeExpiryFromNow, insertEvidence, isEvidenceReusedAcrossOtherItems } from "@/lib/osint/repository";

describe("computeContentHash — the client-side half of source deduplication", () => {
  it("is deterministic for the same (url, fields) pair", () => {
    const a = computeContentHash("https://example.org/award", { name: "Jordan Smith" });
    const b = computeContentHash("https://example.org/award", { name: "Jordan Smith" });
    expect(a).toBe(b);
  });

  it("differs when the URL differs", () => {
    const a = computeContentHash("https://example.org/award", { name: "Jordan Smith" });
    const b = computeContentHash("https://example.org/other", { name: "Jordan Smith" });
    expect(a).not.toBe(b);
  });

  it("differs when the extracted fields differ", () => {
    const a = computeContentHash("https://example.org/award", { name: "Jordan Smith" });
    const b = computeContentHash("https://example.org/award", { name: "Someone Else" });
    expect(a).not.toBe(b);
  });

  it("is a 64-character hex sha256 digest, matching the migration's check constraint", () => {
    const hash = computeContentHash("https://example.org/award", {});
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("computeExpiryFromNow — retention", () => {
  it("returns a timestamp the configured number of days in the future", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const expiry = computeExpiryFromNow(180, now);
    expect(new Date(expiry).getTime() - now.getTime()).toBe(180 * 24 * 60 * 60 * 1000);
  });
});

describe("insertEvidence — dedupe absorption", () => {
  it("treats a unique-constraint violation (23505) as success, not an error", async () => {
    const supabase = {
      from: () => ({ insert: async () => ({ error: { code: "23505", message: "duplicate key" } }) }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await insertEvidence(supabase, {} as any);
    expect(error).toBeNull();
  });

  it("surfaces any other database error", async () => {
    const supabase = {
      from: () => ({ insert: async () => ({ error: { code: "42501", message: "permission denied" } }) }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await insertEvidence(supabase, {} as any);
    expect(error).toBe("permission denied");
  });
});

describe("isEvidenceReusedAcrossOtherItems", () => {
  it("returns false when the student has no other checks at all", async () => {
    const chain = { eq: () => chain, neq: async () => ({ data: [], error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = { from: () => ({ select: () => chain }) } as any;
    expect(await isEvidenceReusedAcrossOtherItems(supabase, "user-1", "item-1", "https://example.org/x")).toBe(false);
  });

  it("returns true when the same source URL already backs a different item's evidence", async () => {
    let call = 0;
    const supabase = {
      from: (table: string) => {
        call++;
        if (table === "portfolio_osint_checks") {
          const chain = { eq: () => chain, neq: async () => ({ data: [{ id: "other-check" }], error: null }) };
          return { select: () => chain };
        }
        const chain = { eq: () => chain, in: () => chain, limit: async () => ({ data: [{ id: "evidence-1" }], error: null }) };
        return { select: () => chain };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    expect(await isEvidenceReusedAcrossOtherItems(supabase, "user-1", "item-1", "https://example.org/x")).toBe(true);
    expect(call).toBe(2);
  });
});

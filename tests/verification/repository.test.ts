import { describe, expect, it, vi } from "vitest";

import { ensureVerificationRow, findDuplicateEvidenceUsage, findVerifierClaimByTokenHash } from "@/lib/verification/repository";

/** A minimal stand-in for supabase-js's chainable query builder — same "inject the dependency" approach tests/portfolio/evidence-repository.test.ts uses. */
function createFakeSupabase(options: {
  existingRow: { id: string } | null;
  insertResult: { data: { id: string } | null; error: { code: string; message: string } | null };
}) {
  const insertFn = vi.fn(() => ({
    select: () => ({
      single: async () => options.insertResult,
    }),
  }));

  const selectChain = {
    eq: () => selectChain,
    maybeSingle: async () => ({ data: options.existingRow, error: null }),
  };

  const supabase = {
    from: () => ({
      select: () => selectChain,
      insert: insertFn,
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  return { supabase, insertFn };
}

describe("ensureVerificationRow — one row per item", () => {
  it("returns the existing row without inserting when one already exists", async () => {
    const { supabase, insertFn } = createFakeSupabase({ existingRow: { id: "existing-verification" }, insertResult: { data: null, error: null } });
    const { verification, error } = await ensureVerificationRow(supabase, "user-1", "item-1");
    expect(error).toBeNull();
    expect(verification?.id).toBe("existing-verification");
    expect(insertFn).not.toHaveBeenCalled();
  });

  it("inserts a default unverified row when none exists yet", async () => {
    const { supabase, insertFn } = createFakeSupabase({ existingRow: null, insertResult: { data: { id: "new-verification" }, error: null } });
    const { verification, error } = await ensureVerificationRow(supabase, "user-1", "item-1");
    expect(error).toBeNull();
    expect(verification?.id).toBe("new-verification");
    expect(insertFn).toHaveBeenCalledOnce();
  });

  it("falls back to the existing row when a race loses to the migration's unique constraint", async () => {
    let lookupCount = 0;
    const selectChain = {
      eq: () => selectChain,
      maybeSingle: async () => {
        lookupCount += 1;
        return lookupCount === 1 ? { data: null, error: null } : { data: { id: "raced-verification" }, error: null };
      },
    };
    const insertFn = vi.fn(() => ({
      select: () => ({ single: async () => ({ data: null, error: { code: "23505", message: "duplicate key" } }) }),
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = { from: () => ({ select: () => selectChain, insert: insertFn }) } as any;

    const { verification, error } = await ensureVerificationRow(supabase, "user-1", "item-1");
    expect(error).toBeNull();
    expect(verification?.id).toBe("raced-verification");
  });
});

describe("findDuplicateEvidenceUsage", () => {
  function fakeSupabaseWithRows(rows: { id: string }[]) {
    const chain = {
      eq: () => chain,
      neq: () => chain,
      limit: async () => ({ data: rows, error: null }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { from: () => ({ select: () => chain }) } as any;
  }

  it("returns false when neither a file nor a url is given", async () => {
    const supabase = fakeSupabaseWithRows([]);
    expect(await findDuplicateEvidenceUsage(supabase, "user-1", "item-1", {})).toBe(false);
  });

  it("returns true when the same file already backs a different item", async () => {
    const supabase = fakeSupabaseWithRows([{ id: "other-verification" }]);
    expect(await findDuplicateEvidenceUsage(supabase, "user-1", "item-1", { fileId: "file-1" })).toBe(true);
  });

  it("returns false when no other item uses this evidence", async () => {
    const supabase = fakeSupabaseWithRows([]);
    expect(await findDuplicateEvidenceUsage(supabase, "user-1", "item-1", { fileId: "file-1" })).toBe(false);
  });
});

describe("findVerifierClaimByTokenHash — minimal single-claim exposure", () => {
  it("returns null when no verification matches the hash", async () => {
    const chain = { eq: () => chain, maybeSingle: async () => ({ data: null, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const serviceClient = { from: () => ({ select: () => chain }) } as any;
    expect(await findVerifierClaimByTokenHash(serviceClient, "deadbeef")).toBeNull();
  });

  it("returns only the item's title/type/organization/dates — never the full portfolio_items row or any other table", async () => {
    const verificationRow = {
      id: "v1",
      user_id: "student-1",
      portfolio_item_id: "item-1",
      verification_level: "unverified",
      verification_code_hash: "deadbeef",
    };
    const itemRow = {
      title: "Robotics Club Captain",
      item_type: "leadership",
      organization: "Lincoln High School",
      start_date: "2026-01-01",
      end_date: null,
    };

    let fromCallCount = 0;
    const tablesQueried: string[] = [];
    const serviceClient = {
      from: (table: string) => {
        fromCallCount += 1;
        tablesQueried.push(table);
        if (table === "portfolio_verifications") {
          const chain = { eq: () => chain, maybeSingle: async () => ({ data: verificationRow, error: null }) };
          return { select: () => chain };
        }
        const chain = { eq: () => chain, maybeSingle: async () => ({ data: itemRow, error: null }) };
        return { select: () => chain };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const claim = await findVerifierClaimByTokenHash(serviceClient, "deadbeef");
    expect(claim).toEqual({
      verification: verificationRow,
      itemTitle: "Robotics Club Captain",
      itemType: "leadership",
      itemOrganization: "Lincoln High School",
      itemStartDate: "2026-01-01",
      itemEndDate: null,
    });
    expect(fromCallCount).toBe(2);
    expect(tablesQueried).toEqual(["portfolio_verifications", "portfolio_items"]);
  });
});

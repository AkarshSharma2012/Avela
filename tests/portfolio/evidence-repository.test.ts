import { describe, expect, it, vi } from "vitest";

import { attachEvidenceLink } from "@/lib/portfolio/evidence-repository";

const INPUT = { applicationPlanId: "plan-1", portfolioItemId: "item-1", evidencePurpose: "resume" as const };

/**
 * A minimal stand-in for supabase-js's chainable query builder, scoped to
 * exactly the calls attachEvidenceLink makes: a `select().eq()...maybeSingle()`
 * lookup, then (if nothing was found) an `insert().select().single()`. Same
 * "inject the dependency" approach tests/opportunities/query.test.ts uses.
 */
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

describe("attachEvidenceLink — duplicate prevention", () => {
  it("reuses an existing (plan, item, purpose) link instead of inserting a duplicate", async () => {
    const { supabase, insertFn } = createFakeSupabase({
      existingRow: { id: "existing-link" },
      insertResult: { data: null, error: null },
    });

    const result = await attachEvidenceLink(supabase, "user-1", INPUT);

    expect(result).toEqual({ linkId: "existing-link", error: null });
    expect(insertFn).not.toHaveBeenCalled();
  });

  it("inserts a new link when none exists yet", async () => {
    const { supabase, insertFn } = createFakeSupabase({
      existingRow: null,
      insertResult: { data: { id: "new-link" }, error: null },
    });

    const result = await attachEvidenceLink(supabase, "user-1", INPUT);

    expect(result).toEqual({ linkId: "new-link", error: null });
    expect(insertFn).toHaveBeenCalledOnce();
  });

  it("falls back to the existing row when a race loses to the migration's unique constraint", async () => {
    let lookupCount = 0;
    const selectChain = {
      eq: () => selectChain,
      maybeSingle: async () => {
        lookupCount += 1;
        // First lookup (before insert): nothing yet. Second lookup (after
        // the unique_violation): the row the other request just created.
        return lookupCount === 1 ? { data: null, error: null } : { data: { id: "raced-link" }, error: null };
      },
    };
    const insertFn = vi.fn(() => ({
      select: () => ({
        single: async () => ({ data: null, error: { code: "23505", message: "duplicate key" } }),
      }),
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = { from: () => ({ select: () => selectChain, insert: insertFn }) } as any;

    const result = await attachEvidenceLink(supabase, "user-1", INPUT);

    expect(result).toEqual({ linkId: "raced-link", error: null });
    expect(insertFn).toHaveBeenCalledOnce();
  });
});

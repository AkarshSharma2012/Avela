import { afterEach, describe, expect, it, vi } from "vitest";

import { connectGithubIdentity } from "@/lib/identity/repository";

const VALID_KEY = Buffer.alloc(32, 7).toString("base64");

afterEach(() => {
  delete process.env.IDENTITY_TOKEN_ENCRYPTION_KEY;
});

type FakeOptions = {
  existingIdentity: { id: string } | null;
  insertResult?: { data: unknown; error: { code: string; message: string } | null };
  updateResult?: { data: unknown; error: { code: string; message: string } | null };
};

/** A minimal stand-in for supabase-js, routed by table name — same "inject the dependency" approach as tests/verification/repository.test.ts. */
function createFakeSupabase(options: FakeOptions) {
  const insertFn = vi.fn((payload: Record<string, unknown>) => {
    void payload;
    return { select: () => ({ single: async () => options.insertResult ?? { data: null, error: null } }) };
  });
  const updateFn = vi.fn(() => ({
    eq: () => ({ select: () => ({ single: async () => options.updateResult ?? { data: null, error: null } }) }),
  }));

  const identitySelectChain = {
    eq: () => identitySelectChain,
    is: () => identitySelectChain,
    maybeSingle: async () => ({ data: options.existingIdentity, error: null }),
  };

  const eventInsertFn = vi.fn(async () => ({ data: null, error: null }));

  const supabase = {
    from: (table: string) => {
      if (table === "connected_identity_events") {
        return { insert: eventInsertFn };
      }
      return { select: () => identitySelectChain, insert: insertFn, update: updateFn };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  return { supabase, insertFn, updateFn, eventInsertFn };
}

const PROFILE = { subject: "42", username: "octocat", profileUrl: "https://github.com/octocat", displayName: "The Octocat", avatarUrl: null };

describe("connectGithubIdentity", () => {
  it("inserts a new row when the student has no active connection yet", async () => {
    process.env.IDENTITY_TOKEN_ENCRYPTION_KEY = VALID_KEY;
    const { supabase, insertFn, updateFn } = createFakeSupabase({
      existingIdentity: null,
      insertResult: { data: { id: "new-identity", user_id: "user-1" }, error: null },
    });

    const result = await connectGithubIdentity(supabase, "user-1", PROFILE, "raw-token", ["read:user"]);
    expect(result.ok).toBe(true);
    expect(insertFn).toHaveBeenCalledOnce();
    expect(updateFn).not.toHaveBeenCalled();
  });

  it("updates the existing row (reconnect) rather than inserting a second one when a connection already exists", async () => {
    process.env.IDENTITY_TOKEN_ENCRYPTION_KEY = VALID_KEY;
    const { supabase, insertFn, updateFn } = createFakeSupabase({
      existingIdentity: { id: "existing-identity" },
      updateResult: { data: { id: "existing-identity", user_id: "user-1" }, error: null },
    });

    const result = await connectGithubIdentity(supabase, "user-1", PROFILE, "raw-token", ["read:user"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.wasReconnect).toBe(true);
    expect(updateFn).toHaveBeenCalledOnce();
    expect(insertFn).not.toHaveBeenCalled();
  });

  it("reports 'already_linked_elsewhere' — never a generic error — when the global unique-active-subject index conflicts", async () => {
    process.env.IDENTITY_TOKEN_ENCRYPTION_KEY = VALID_KEY;
    const { supabase } = createFakeSupabase({
      existingIdentity: null,
      insertResult: { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } },
    });

    const result = await connectGithubIdentity(supabase, "user-1", PROFILE, "raw-token", []);
    expect(result).toMatchObject({ ok: false, reason: "already_linked_elsewhere" });
  });

  it("encrypts the access token before it is ever passed to insert — the raw token never appears in the write payload", async () => {
    process.env.IDENTITY_TOKEN_ENCRYPTION_KEY = VALID_KEY;
    const { supabase, insertFn } = createFakeSupabase({
      existingIdentity: null,
      insertResult: { data: { id: "new-identity" }, error: null },
    });

    await connectGithubIdentity(supabase, "user-1", PROFILE, "gho_supersecret", []);
    const insertedPayload = insertFn.mock.calls[0]?.[0];
    expect(JSON.stringify(insertedPayload)).not.toContain("gho_supersecret");
    expect(insertedPayload?.access_token_ciphertext).toBeTruthy();
  });

  it("stores no ciphertext at all when there is no access token (the possession-challenge-only path)", async () => {
    process.env.IDENTITY_TOKEN_ENCRYPTION_KEY = VALID_KEY;
    const { supabase, insertFn } = createFakeSupabase({
      existingIdentity: null,
      insertResult: { data: { id: "new-identity" }, error: null },
    });

    await connectGithubIdentity(supabase, "user-1", PROFILE, null, []);
    const insertedPayload = insertFn.mock.calls[0]?.[0];
    expect(insertedPayload?.access_token_ciphertext).toBeNull();
  });
});

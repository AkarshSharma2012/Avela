import { describe, expect, it, vi } from "vitest";

import { resolveConfirmation, type ConfirmOps } from "@/lib/auth/confirm";

function makeOps(overrides: Partial<ConfirmOps> = {}): ConfirmOps {
  return {
    verifyOtp: vi.fn().mockResolvedValue({ error: null }),
    exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
    getProfile: vi.fn().mockResolvedValue({ onboarding_completed: false }),
    ...overrides,
  };
}

describe("resolveConfirmation — token_hash + type", () => {
  it("confirms successfully and routes incomplete profiles to /onboarding", async () => {
    const ops = makeOps({
      getProfile: vi.fn().mockResolvedValue({ onboarding_completed: false }),
    });

    const result = await resolveConfirmation(
      { tokenHash: "hash-123", type: "signup", code: null },
      ops
    );

    expect(result).toEqual({ ok: true, destination: "/onboarding" });
    expect(ops.verifyOtp).toHaveBeenCalledWith({ token_hash: "hash-123", type: "signup" });
    expect(ops.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("confirms successfully and routes completed profiles to /dashboard", async () => {
    const ops = makeOps({
      getProfile: vi.fn().mockResolvedValue({ onboarding_completed: true }),
    });

    const result = await resolveConfirmation(
      { tokenHash: "hash-123", type: "email", code: null },
      ops
    );

    expect(result).toEqual({ ok: true, destination: "/dashboard" });
  });
});

describe("resolveConfirmation — code exchange", () => {
  it("confirms successfully via exchangeCodeForSession", async () => {
    const ops = makeOps({
      getProfile: vi.fn().mockResolvedValue({ onboarding_completed: true }),
    });

    const result = await resolveConfirmation(
      { tokenHash: null, type: null, code: "auth-code-456" },
      ops
    );

    expect(result).toEqual({ ok: true, destination: "/dashboard" });
    expect(ops.exchangeCodeForSession).toHaveBeenCalledWith("auth-code-456");
    expect(ops.verifyOtp).not.toHaveBeenCalled();
  });

  it("prefers token_hash + type over code when both are present", async () => {
    const ops = makeOps();

    await resolveConfirmation(
      { tokenHash: "hash-123", type: "signup", code: "auth-code-456" },
      ops
    );

    expect(ops.verifyOtp).toHaveBeenCalledTimes(1);
    expect(ops.exchangeCodeForSession).not.toHaveBeenCalled();
  });
});

describe("resolveConfirmation — invalid or missing parameters", () => {
  it("fails when no token_hash, type, or code is present", async () => {
    const ops = makeOps();

    const result = await resolveConfirmation({ tokenHash: null, type: null, code: null }, ops);

    expect(result).toEqual({ ok: false });
    expect(ops.verifyOtp).not.toHaveBeenCalled();
    expect(ops.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("falls back to code when token_hash is present but type is not a recognized OTP type", async () => {
    const ops = makeOps();

    const result = await resolveConfirmation(
      { tokenHash: "hash-123", type: "not-a-real-type", code: "auth-code-456" },
      ops
    );

    expect(result).toEqual({ ok: true, destination: "/onboarding" });
    expect(ops.verifyOtp).not.toHaveBeenCalled();
    expect(ops.exchangeCodeForSession).toHaveBeenCalledWith("auth-code-456");
  });

  it("fails when token_hash has an unrecognized type and there is no code fallback", async () => {
    const ops = makeOps();

    const result = await resolveConfirmation(
      { tokenHash: "hash-123", type: "not-a-real-type", code: null },
      ops
    );

    expect(result).toEqual({ ok: false });
    expect(ops.verifyOtp).not.toHaveBeenCalled();
  });
});

describe("resolveConfirmation — confirmation failure", () => {
  it("fails when verifyOtp returns an error, without ever checking the profile", async () => {
    const ops = makeOps({
      verifyOtp: vi.fn().mockResolvedValue({ error: { message: "Token has expired" } }),
    });

    const result = await resolveConfirmation(
      { tokenHash: "hash-123", type: "signup", code: null },
      ops
    );

    expect(result).toEqual({ ok: false });
    expect(ops.getProfile).not.toHaveBeenCalled();
  });

  it("fails when exchangeCodeForSession returns an error", async () => {
    const ops = makeOps({
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error: { message: "invalid code" } }),
    });

    const result = await resolveConfirmation(
      { tokenHash: null, type: null, code: "bad-code" },
      ops
    );

    expect(result).toEqual({ ok: false });
    expect(ops.getProfile).not.toHaveBeenCalled();
  });

  it("fails when the confirmation succeeds but no profile can be resolved", async () => {
    const ops = makeOps({ getProfile: vi.fn().mockResolvedValue(null) });

    const result = await resolveConfirmation(
      { tokenHash: "hash-123", type: "signup", code: null },
      ops
    );

    expect(result).toEqual({ ok: false });
  });

  it("never leaks the underlying error message into the result", async () => {
    const ops = makeOps({
      verifyOtp: vi.fn().mockResolvedValue({ error: { message: "super secret internal detail" } }),
    });

    const result = await resolveConfirmation(
      { tokenHash: "hash-123", type: "signup", code: null },
      ops
    );

    expect(JSON.stringify(result)).not.toMatch(/secret/);
  });
});

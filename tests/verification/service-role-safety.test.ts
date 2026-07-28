import { afterEach, describe, expect, it, vi } from "vitest";

import { createVerificationServiceRoleClient } from "@/lib/verification/repository";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createVerificationServiceRoleClient — fails closed with no secret leakage", () => {
  it("throws a clear configuration error when SUPABASE_SERVICE_ROLE_KEY is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => createVerificationServiceRoleClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("throws a clear configuration error when NEXT_PUBLIC_SUPABASE_URL is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "a-fake-service-role-key-value");
    expect(() => createVerificationServiceRoleClient()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("the thrown error message never contains the configured secret value", () => {
    const secret = "a-very-secret-service-role-key-0123456789";
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", secret);
    try {
      createVerificationServiceRoleClient();
      expect.unreachable("expected createVerificationServiceRoleClient to throw");
    } catch (err) {
      expect(String(err)).not.toContain(secret);
    }
  });

  it("succeeds and returns a client when both env vars are present", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "a-fake-service-role-key-value");
    expect(() => createVerificationServiceRoleClient()).not.toThrow();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  E2E_EMAIL_DOMAIN,
  E2E_TITLE_PREFIX,
  createE2eServiceRoleClient,
  generateE2eEmail,
  generateE2ePassword,
  isE2eTestUsersAllowed,
  isIsolatedE2eBackendConfigured,
  requireE2eTestUsersAllowed,
  requireIsolatedE2eBackend,
} from "@/lib/e2e/config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isE2eTestUsersAllowed / requireE2eTestUsersAllowed — fail closed", () => {
  it("is false by default (flag unset)", () => {
    vi.stubEnv("ALLOW_E2E_TEST_USERS", "");
    expect(isE2eTestUsersAllowed()).toBe(false);
  });

  it("is false for any value other than the literal string 'true'", () => {
    vi.stubEnv("ALLOW_E2E_TEST_USERS", "1");
    expect(isE2eTestUsersAllowed()).toBe(false);
    vi.stubEnv("ALLOW_E2E_TEST_USERS", "yes");
    expect(isE2eTestUsersAllowed()).toBe(false);
  });

  it("is true only when explicitly set to 'true'", () => {
    vi.stubEnv("ALLOW_E2E_TEST_USERS", "true");
    expect(isE2eTestUsersAllowed()).toBe(true);
  });

  it("requireE2eTestUsersAllowed throws a clear error when the flag is off", () => {
    vi.stubEnv("ALLOW_E2E_TEST_USERS", "");
    expect(() => requireE2eTestUsersAllowed()).toThrow(/ALLOW_E2E_TEST_USERS/);
  });

  it("requireE2eTestUsersAllowed does not throw when the flag is on", () => {
    vi.stubEnv("ALLOW_E2E_TEST_USERS", "true");
    expect(() => requireE2eTestUsersAllowed()).not.toThrow();
  });
});

describe("requireIsolatedE2eBackend — never falls back to production, ever", () => {
  it("throws when none of the E2E_SUPABASE_* vars are set", () => {
    vi.stubEnv("E2E_SUPABASE_URL", "");
    vi.stubEnv("E2E_SUPABASE_ANON_KEY", "");
    vi.stubEnv("E2E_SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => requireIsolatedE2eBackend()).toThrow(/E2E_SUPABASE_URL/);
  });

  it("throws when only some of the E2E_SUPABASE_* vars are set", () => {
    vi.stubEnv("E2E_SUPABASE_URL", "https://isolated-test-project.supabase.co");
    vi.stubEnv("E2E_SUPABASE_ANON_KEY", "");
    vi.stubEnv("E2E_SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => requireIsolatedE2eBackend()).toThrow();
  });

  it("throws when E2E_SUPABASE_URL matches the production NEXT_PUBLIC_SUPABASE_URL — never runs against production", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://prod-project.supabase.co");
    vi.stubEnv("E2E_SUPABASE_URL", "https://prod-project.supabase.co");
    vi.stubEnv("E2E_SUPABASE_ANON_KEY", "fake-anon-key");
    vi.stubEnv("E2E_SUPABASE_SERVICE_ROLE_KEY", "fake-service-key");
    expect(() => requireIsolatedE2eBackend()).toThrow(/production/i);
  });

  it("throws on a production-URL match even with different casing or a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://prod-project.supabase.co");
    vi.stubEnv("E2E_SUPABASE_URL", "HTTPS://PROD-PROJECT.supabase.co/");
    vi.stubEnv("E2E_SUPABASE_ANON_KEY", "fake-anon-key");
    vi.stubEnv("E2E_SUPABASE_SERVICE_ROLE_KEY", "fake-service-key");
    expect(() => requireIsolatedE2eBackend()).toThrow(/production/i);
  });

  it("succeeds when a genuinely different, fully-configured E2E project is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://prod-project.supabase.co");
    vi.stubEnv("E2E_SUPABASE_URL", "https://isolated-test-project.supabase.co");
    vi.stubEnv("E2E_SUPABASE_ANON_KEY", "fake-anon-key");
    vi.stubEnv("E2E_SUPABASE_SERVICE_ROLE_KEY", "fake-service-key");
    expect(() => requireIsolatedE2eBackend()).not.toThrow();
    expect(isIsolatedE2eBackendConfigured()).toBe(true);
  });

  it("succeeds with no production URL configured at all, as long as the E2E project is fully configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("E2E_SUPABASE_URL", "https://isolated-test-project.supabase.co");
    vi.stubEnv("E2E_SUPABASE_ANON_KEY", "fake-anon-key");
    vi.stubEnv("E2E_SUPABASE_SERVICE_ROLE_KEY", "fake-service-key");
    expect(() => requireIsolatedE2eBackend()).not.toThrow();
  });

  it("isIsolatedE2eBackendConfigured never throws, even when unconfigured", () => {
    vi.stubEnv("E2E_SUPABASE_URL", "");
    vi.stubEnv("E2E_SUPABASE_ANON_KEY", "");
    vi.stubEnv("E2E_SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => isIsolatedE2eBackendConfigured()).not.toThrow();
    expect(isIsolatedE2eBackendConfigured()).toBe(false);
  });
});

describe("createE2eServiceRoleClient — fails closed on both gates", () => {
  it("throws when the ALLOW_E2E_TEST_USERS flag is off, even with a valid isolated backend configured", () => {
    vi.stubEnv("ALLOW_E2E_TEST_USERS", "");
    vi.stubEnv("E2E_SUPABASE_URL", "https://isolated-test-project.supabase.co");
    vi.stubEnv("E2E_SUPABASE_ANON_KEY", "fake-anon-key");
    vi.stubEnv("E2E_SUPABASE_SERVICE_ROLE_KEY", "fake-service-key");
    expect(() => createE2eServiceRoleClient()).toThrow(/ALLOW_E2E_TEST_USERS/);
  });

  it("throws when the flag is on but the isolated backend isn't configured", () => {
    vi.stubEnv("ALLOW_E2E_TEST_USERS", "true");
    vi.stubEnv("E2E_SUPABASE_URL", "");
    vi.stubEnv("E2E_SUPABASE_ANON_KEY", "");
    vi.stubEnv("E2E_SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => createE2eServiceRoleClient()).toThrow(/E2E_SUPABASE_URL/);
  });

  it("throws when the flag is on and the E2E URL matches production, never silently using production", () => {
    vi.stubEnv("ALLOW_E2E_TEST_USERS", "true");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://prod-project.supabase.co");
    vi.stubEnv("E2E_SUPABASE_URL", "https://prod-project.supabase.co");
    vi.stubEnv("E2E_SUPABASE_ANON_KEY", "fake-anon-key");
    vi.stubEnv("E2E_SUPABASE_SERVICE_ROLE_KEY", "fake-service-key");
    expect(() => createE2eServiceRoleClient()).toThrow(/production/i);
  });

  it("succeeds only when both gates pass: the flag is on AND a genuinely isolated backend is configured", () => {
    vi.stubEnv("ALLOW_E2E_TEST_USERS", "true");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://prod-project.supabase.co");
    vi.stubEnv("E2E_SUPABASE_URL", "https://isolated-test-project.supabase.co");
    vi.stubEnv("E2E_SUPABASE_ANON_KEY", "fake-anon-key");
    vi.stubEnv("E2E_SUPABASE_SERVICE_ROLE_KEY", "fake-service-key");
    expect(() => createE2eServiceRoleClient()).not.toThrow();
  });
});

describe("generateE2eEmail", () => {
  it("always uses the synthetic E2E domain, never a real one", () => {
    expect(generateE2eEmail("digital_creator")).toMatch(new RegExp(`@${E2E_EMAIL_DOMAIN.replace(".", "\\.")}$`));
  });

  it("generates a fresh, non-colliding address on every call", () => {
    const a = generateE2eEmail("digital_creator");
    const b = generateE2eEmail("digital_creator");
    expect(a).not.toBe(b);
  });
});

describe("generateE2ePassword", () => {
  it("generates a long, random password, different every call", () => {
    const a = generateE2ePassword();
    const b = generateE2ePassword();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });
});

describe("E2E_TITLE_PREFIX", () => {
  it("is the exact spec-required marker", () => {
    expect(E2E_TITLE_PREFIX).toBe("[E2E TEST] ");
  });
});

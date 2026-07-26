import { describe, expect, it } from "vitest";

import {
  getPostAuthDestination,
  isProtectedPath,
} from "@/lib/auth/route-rules";

describe("isProtectedPath", () => {
  it("protects /dashboard and nested paths", () => {
    expect(isProtectedPath("/dashboard")).toBe(true);
    expect(isProtectedPath("/dashboard/settings")).toBe(true);
  });

  it("protects /onboarding", () => {
    expect(isProtectedPath("/onboarding")).toBe(true);
  });

  it("does not protect public routes", () => {
    expect(isProtectedPath("/login")).toBe(false);
    expect(isProtectedPath("/signup")).toBe(false);
    expect(isProtectedPath("/")).toBe(false);
  });

  it("does not falsely match similarly-prefixed paths", () => {
    expect(isProtectedPath("/dashboard-preview")).toBe(false);
  });
});

describe("getPostAuthDestination", () => {
  it("sends unauthenticated visitors to /login", () => {
    expect(getPostAuthDestination(null)).toBe("/login");
  });

  it("sends incomplete profiles to /onboarding", () => {
    expect(getPostAuthDestination({ onboarding_completed: false })).toBe(
      "/onboarding"
    );
  });

  it("sends completed profiles to /dashboard", () => {
    expect(getPostAuthDestination({ onboarding_completed: true })).toBe(
      "/dashboard"
    );
  });
});

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

  it("protects the Milestone 3 app-shell routes and their nested paths", () => {
    expect(isProtectedPath("/opportunities")).toBe(true);
    expect(isProtectedPath("/opportunities/123")).toBe(true);
    expect(isProtectedPath("/saved")).toBe(true);
    expect(isProtectedPath("/profile")).toBe(true);
    expect(isProtectedPath("/settings")).toBe(true);
  });

  it("protects /portfolio and its item workspace pages", () => {
    expect(isProtectedPath("/portfolio")).toBe(true);
    expect(isProtectedPath("/portfolio/items/abc-123")).toBe(true);
  });

  it("protects /applications and its nested workspace pages", () => {
    expect(isProtectedPath("/applications")).toBe(true);
    expect(isProtectedPath("/applications/abc-123")).toBe(true);
  });

  it("protects /reminders and any nested paths", () => {
    expect(isProtectedPath("/reminders")).toBe(true);
    expect(isProtectedPath("/reminders/abc-123")).toBe(true);
  });

  it("does not protect public routes", () => {
    expect(isProtectedPath("/login")).toBe(false);
    expect(isProtectedPath("/signup")).toBe(false);
    expect(isProtectedPath("/")).toBe(false);
  });

  it("does not falsely match similarly-prefixed paths", () => {
    expect(isProtectedPath("/dashboard-preview")).toBe(false);
    expect(isProtectedPath("/applications-info")).toBe(false);
    expect(isProtectedPath("/reminders-help")).toBe(false);
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

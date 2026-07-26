import { describe, expect, it } from "vitest";

import { isNavItemActive } from "@/lib/navigation/active-path";

describe("isNavItemActive", () => {
  it("is active on an exact match", () => {
    expect(isNavItemActive("/dashboard", "/dashboard")).toBe(true);
  });

  it("is active on a nested route", () => {
    expect(isNavItemActive("/opportunities/123", "/opportunities")).toBe(true);
  });

  it("is not active for a different top-level route", () => {
    expect(isNavItemActive("/saved", "/dashboard")).toBe(false);
  });

  it("does not falsely match similarly-prefixed routes", () => {
    expect(isNavItemActive("/dashboard-preview", "/dashboard")).toBe(false);
  });
});

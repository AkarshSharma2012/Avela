import { describe, expect, it } from "vitest";

import { PASSION_GROUPS } from "@/lib/portfolio/taxonomy";
import { PROVIDER_REGISTRY } from "@/lib/identity/provider-registry-data";
import type { ProviderCategoryGroup } from "@/lib/identity/provider-registry";

/**
 * The spec's 12 lettered provider passion areas (A-L) — 10 of the 11
 * taxonomy passion groups plus two provider-only groupings. Deliberately
 * excludes "home_family_and_life_skills": the spec names no provider list
 * for that group at all (family/caregiving/cooking/etc. rely on files,
 * public links, and "ask someone to confirm," never a connected account —
 * spec section 6: "do not show GitHub for family responsibility"), so it
 * correctly resolves zero registry providers; see provider-availability.test.ts.
 */
const SPEC_PROVIDER_GROUPS: ProviderCategoryGroup[] = [
  ...PASSION_GROUPS.filter((group) => group !== "home_family_and_life_skills"),
  "learning_and_credentials",
  "general_and_custom",
];

describe("PROVIDER_REGISTRY schema completeness", () => {
  it("has unique keys", () => {
    const keys = PROVIDER_REGISTRY.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has every required field populated for every entry", () => {
    for (const entry of PROVIDER_REGISTRY) {
      expect(entry.key.length).toBeGreaterThan(0);
      expect(entry.studentFacingName.length).toBeGreaterThan(0);
      expect(entry.categoryGroups.length).toBeGreaterThan(0);
      expect(["oauth", "proof_of_control", "public_link_only", "unsupported_manual_only"]).toContain(entry.tier);
      expect(entry.disconnectBehavior.length).toBeGreaterThan(0);
      expect(entry.limitations.length).toBeGreaterThan(0);
    }
  });

  it("never shows internal keys as the student-facing name", () => {
    for (const entry of PROVIDER_REGISTRY) {
      expect(entry.studentFacingName).not.toBe(entry.key);
    }
  });

  it("has at least 10 candidate providers in every one of the 12 passion-area groups (spec section 8)", () => {
    for (const group of SPEC_PROVIDER_GROUPS) {
      const count = PROVIDER_REGISTRY.filter((entry) => entry.categoryGroups.includes(group)).length;
      expect(count, `group "${group}" has only ${count} providers`).toBeGreaterThanOrEqual(10);
    }
  });

  it("never claims OAuth support without documenting required env vars", () => {
    for (const entry of PROVIDER_REGISTRY.filter((provider) => provider.tier === "oauth")) {
      expect(entry.oauthSupport).toBe(true);
      expect(entry.requiredEnvVars.length).toBeGreaterThan(0);
    }
  });

  it("only GitHub is registered at the oauth tier — no other provider claims a real OAuth integration that doesn't exist in this codebase", () => {
    const oauthProviders = PROVIDER_REGISTRY.filter((provider) => provider.tier === "oauth");
    expect(oauthProviders.map((provider) => provider.key)).toEqual(["github"]);
  });

  it("grants zero supportable dimensions to unsupported_manual_only providers — honest about having no automated verification", () => {
    for (const entry of PROVIDER_REGISTRY.filter((provider) => provider.tier === "unsupported_manual_only")) {
      expect(entry.supportableDimensions.length).toBe(0);
      expect(entry.oauthSupport).toBe(false);
      expect(entry.proofOfControlSupport).toBe(false);
    }
  });

  it("every proof_of_control provider actually declares proof-of-control support", () => {
    for (const entry of PROVIDER_REGISTRY.filter((provider) => provider.tier === "proof_of_control")) {
      expect(entry.proofOfControlSupport).toBe(true);
    }
  });
});

describe("the app stays fully functional with zero providers configured (spec section 9)", () => {
  it("every passion group has at least one non-OAuth (always-available) provider or a link-only fallback", () => {
    for (const group of SPEC_PROVIDER_GROUPS) {
      const nonOauth = PROVIDER_REGISTRY.filter(
        (entry) => entry.categoryGroups.includes(group) && entry.tier !== "oauth"
      );
      expect(nonOauth.length).toBeGreaterThan(0);
    }
  });
});

import { afterEach, describe, expect, it } from "vitest";

import {
  findProvider,
  isProviderAvailable,
  isProviderConnectable,
  resolveOfferedMethodsForCategory,
} from "@/lib/identity/provider-availability";

afterEach(() => {
  delete process.env.GITHUB_OAUTH_CLIENT_ID;
  delete process.env.GITHUB_OAUTH_CLIENT_SECRET;
  delete process.env.GITHUB_OAUTH_REDIRECT_URI;
});

describe("isProviderAvailable — fails closed", () => {
  it("GitHub (oauth tier) is unavailable by default — no real OAuth App configured in this environment", () => {
    const github = findProvider("github")!;
    expect(isProviderAvailable(github)).toBe(false);
    expect(isProviderConnectable(github)).toBe(false);
  });

  it("GitHub becomes available once every required env var is set", () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = "id";
    process.env.GITHUB_OAUTH_CLIENT_SECRET = "secret";
    process.env.GITHUB_OAUTH_REDIRECT_URI = "https://example.com/callback";
    const github = findProvider("github")!;
    expect(isProviderAvailable(github)).toBe(true);
    expect(isProviderConnectable(github)).toBe(true);
  });

  it("a proof_of_control provider is always available — no external credentials required", () => {
    const gitlab = findProvider("gitlab")!;
    expect(isProviderAvailable(gitlab)).toBe(true);
    expect(isProviderConnectable(gitlab)).toBe(true);
  });

  it("a public_link_only provider is never connectable — no Connect button, ever", () => {
    const spotify = findProvider("spotify_artist_page")!;
    expect(isProviderConnectable(spotify)).toBe(false);
  });

  it("an unsupported_manual_only provider is never connectable", () => {
    const schoolPage = findProvider("school_club_public_page")!;
    expect(isProviderConnectable(schoolPage)).toBe(false);
  });
});

describe("resolveOfferedMethodsForCategory", () => {
  it("never shows GitHub for a painting by default", () => {
    const offered = resolveOfferedMethodsForCategory("painting");
    expect([...offered.primary, ...offered.more].some((provider) => provider.key === "github")).toBe(false);
  });

  it("never shows GitHub for cooking or family responsibility", () => {
    for (const category of ["cooking", "family_responsibility"]) {
      const offered = resolveOfferedMethodsForCategory(category);
      expect([...offered.primary, ...offered.more].some((provider) => provider.key === "github")).toBe(false);
    }
  });

  it("shows GitHub as relevant for a coding category", () => {
    const offered = resolveOfferedMethodsForCategory("coding");
    expect([...offered.primary, ...offered.more].some((provider) => provider.key === "github")).toBe(true);
  });

  it("suggests at most 3 primary providers, with the rest behind 'see more'", () => {
    const offered = resolveOfferedMethodsForCategory("painting");
    expect(offered.primary.length).toBeLessThanOrEqual(3);
  });

  it("resolves cleanly (never throws, always a well-formed structure) for an unknown category", () => {
    // The generic fallback category has no connected-provider group of its
    // own (spec: family/home-style work relies on files/links/ask-someone,
    // never a connected account) — zero providers is a valid, correct
    // result here, not a broken one.
    expect(() => resolveOfferedMethodsForCategory("some_future_category")).not.toThrow();
    const offered = resolveOfferedMethodsForCategory("some_future_category");
    expect(Array.isArray(offered.primary)).toBe(true);
    expect(Array.isArray(offered.more)).toBe(true);
  });

  it("still returns relevant link-only suggestions for a category with no connectable providers configured", () => {
    const offered = resolveOfferedMethodsForCategory("coding");
    // Even with GitHub unavailable (unconfigured in this environment), the
    // category still resolves to real, relevant suggestions.
    expect(offered.primary.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";

import { classifyPageAuthority, isAuthoritativeLevel, isSocialMediaDomain } from "@/lib/osint/authority";

describe("isAuthoritativeLevel", () => {
  it("treats issuer, official_organization, and trusted_registry as authoritative", () => {
    expect(isAuthoritativeLevel("issuer")).toBe(true);
    expect(isAuthoritativeLevel("official_organization")).toBe(true);
    expect(isAuthoritativeLevel("trusted_registry")).toBe(true);
  });

  it("never treats verified_public_profile, secondary_source, or unknown as authoritative", () => {
    expect(isAuthoritativeLevel("verified_public_profile")).toBe(false);
    expect(isAuthoritativeLevel("secondary_source")).toBe(false);
    expect(isAuthoritativeLevel("unknown")).toBe(false);
  });
});

describe("classifyPageAuthority — HTTPS alone never verifies a claim", () => {
  it("an ordinary https .com domain with no other signal is only a secondary source", () => {
    const level = classifyPageAuthority({
      hostname: "someclub.com",
      matchesClaimedOrganizationDomain: false,
      hasStructuredIssuerMetadata: false,
    });
    expect(level).toBe("secondary_source");
  });
});

describe("classifyPageAuthority — domain suffix is a signal toward official_organization, never issuer", () => {
  it("a .edu domain without structured issuer metadata is official_organization, not issuer", () => {
    const level = classifyPageAuthority({
      hostname: "lincolnhigh.edu",
      matchesClaimedOrganizationDomain: false,
      hasStructuredIssuerMetadata: false,
    });
    expect(level).toBe("official_organization");
  });

  it("only structured issuer metadata earns issuer, regardless of domain", () => {
    const level = classifyPageAuthority({
      hostname: "someaward.org",
      matchesClaimedOrganizationDomain: false,
      hasStructuredIssuerMetadata: true,
    });
    expect(level).toBe("issuer");
  });
});

describe("classifyPageAuthority — social media alone never produces an authoritative level", () => {
  it("classifies a social media domain as secondary_source even with structured metadata present", () => {
    const level = classifyPageAuthority({
      hostname: "www.instagram.com",
      matchesClaimedOrganizationDomain: true,
      hasStructuredIssuerMetadata: true,
    });
    expect(level).toBe("secondary_source");
    expect(isAuthoritativeLevel(level)).toBe(false);
  });

  it("recognizes social media hosts including www-prefixed and subdomains", () => {
    expect(isSocialMediaDomain("www.facebook.com")).toBe(true);
    expect(isSocialMediaDomain("m.facebook.com")).toBe(true);
    expect(isSocialMediaDomain("lincolnhigh.edu")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { computeContentHash, detectDuplicate, type DedupeCandidate } from "@/lib/opportunities/dedupe";

function candidate(overrides: Partial<DedupeCandidate> = {}): DedupeCandidate {
  return {
    title: "Example Summer Fellowship",
    organization: "Example Foundation",
    canonicalUrl: null,
    applicationUrl: "https://example.org/apply",
    sourceUrl: "https://example.org/listing",
    applicationDeadline: "2027-03-15T00:00:00Z",
    contentHash: computeContentHash(["https://example.org/listing", "Example Summer Fellowship", ""]),
    ...overrides,
  };
}

describe("computeContentHash", () => {
  it("is deterministic for the same input", () => {
    expect(computeContentHash(["a", "b", "c"])).toBe(computeContentHash(["a", "b", "c"]));
  });

  it("is case/whitespace-insensitive", () => {
    expect(computeContentHash(["Hello World"])).toBe(computeContentHash(["  hello world  "]));
  });

  it("differs for different input", () => {
    expect(computeContentHash(["a"])).not.toBe(computeContentHash(["b"]));
  });
});

describe("detectDuplicate", () => {
  it("is an exact duplicate when content hashes match", () => {
    const a = candidate();
    const b = candidate({ applicationUrl: "https://example.org/apply?ref=other" });
    // force distinct application URLs but same hash
    const sameHash = { ...b, contentHash: a.contentHash };
    expect(detectDuplicate(a, sameHash)).toBe("exact_duplicate");
  });

  it("is an exact duplicate when canonical URLs match", () => {
    const a = candidate({ canonicalUrl: "https://example.org/canonical" });
    const b = candidate({
      canonicalUrl: "https://example.org/canonical",
      contentHash: "different",
      applicationUrl: "https://mirror.example.org/apply",
    });
    expect(detectDuplicate(a, b)).toBe("exact_duplicate");
  });

  it("is an exact duplicate when application URLs match", () => {
    const a = candidate();
    const b = candidate({ contentHash: "different-hash", sourceUrl: "https://another.org/listing" });
    expect(detectDuplicate(a, b)).toBe("exact_duplicate");
  });

  it("is a probable duplicate when two or more signals match without an exact URL/hash match", () => {
    const a = candidate();
    const b = candidate({
      contentHash: "different-hash",
      applicationUrl: "https://mirror.example.org/apply",
      sourceUrl: "https://mirror.example.org/listing",
      // same title and organization as `a`
    });
    expect(detectDuplicate(a, b)).toBe("probable_duplicate");
  });

  it("is distinct when fewer than two signals match", () => {
    const a = candidate();
    const b = candidate({
      title: "Totally Different Program",
      organization: "Another Org",
      contentHash: "different-hash",
      applicationUrl: "https://mirror.example.org/apply",
      sourceUrl: "https://mirror.example.org/listing",
      applicationDeadline: null,
    });
    expect(detectDuplicate(a, b)).toBe("distinct");
  });
});

import { describe, expect, it } from "vitest";

import {
  validateEvidenceUrl,
  validateReviewNotes,
  validateVerifierEmail,
  validateVerifierName,
  validateVerifierOrganization,
} from "@/lib/verification/validation";

describe("validateVerifierName", () => {
  it("requires a non-empty name", () => {
    expect(validateVerifierName(null)).not.toBeNull();
    expect(validateVerifierName("  ")).not.toBeNull();
    expect(validateVerifierName("Ms. Rivera")).toBeNull();
  });

  it("rejects an excessively long name", () => {
    expect(validateVerifierName("a".repeat(201))).not.toBeNull();
  });
});

describe("validateVerifierEmail", () => {
  it("requires a well-formed email", () => {
    expect(validateVerifierEmail(null)).not.toBeNull();
    expect(validateVerifierEmail("not-an-email")).not.toBeNull();
    expect(validateVerifierEmail("teacher@school.edu")).toBeNull();
  });
});

describe("validateVerifierOrganization", () => {
  it("is optional but bounded", () => {
    expect(validateVerifierOrganization(null)).toBeNull();
    expect(validateVerifierOrganization("a".repeat(201))).not.toBeNull();
  });
});

describe("validateReviewNotes", () => {
  it("is optional but bounded to 2000 characters", () => {
    expect(validateReviewNotes(null)).toBeNull();
    expect(validateReviewNotes("a".repeat(2001))).not.toBeNull();
    expect(validateReviewNotes("a".repeat(2000))).toBeNull();
  });
});

describe("validateEvidenceUrl", () => {
  it("requires https", () => {
    expect(validateEvidenceUrl("http://example.org")).not.toBeNull();
    expect(validateEvidenceUrl("https://example.org")).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(validateEvidenceUrl("not a url")).not.toBeNull();
    expect(validateEvidenceUrl(null)).not.toBeNull();
  });
});

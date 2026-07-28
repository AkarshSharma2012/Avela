import { afterEach, describe, expect, it } from "vitest";

import { isAuthorizedReviewer } from "@/lib/verification/reviewer-auth";

const ORIGINAL_ENV = process.env.REVIEWER_EMAILS;

afterEach(() => {
  process.env.REVIEWER_EMAILS = ORIGINAL_ENV;
});

describe("isAuthorizedReviewer", () => {
  it("denies everyone when the allowlist is unset", () => {
    delete process.env.REVIEWER_EMAILS;
    expect(isAuthorizedReviewer("someone@school.edu")).toBe(false);
  });

  it("allows only emails in the comma-separated allowlist, case-insensitively", () => {
    process.env.REVIEWER_EMAILS = "reviewer@avela.app, Second.Reviewer@avela.app";
    expect(isAuthorizedReviewer("reviewer@avela.app")).toBe(true);
    expect(isAuthorizedReviewer("SECOND.reviewer@avela.app")).toBe(true);
    expect(isAuthorizedReviewer("student@example.com")).toBe(false);
  });

  it("denies a null/undefined email", () => {
    process.env.REVIEWER_EMAILS = "reviewer@avela.app";
    expect(isAuthorizedReviewer(null)).toBe(false);
    expect(isAuthorizedReviewer(undefined)).toBe(false);
  });

  it("denies everyone when the allowlist is an empty string (fail closed, not 'allow all')", () => {
    process.env.REVIEWER_EMAILS = "";
    expect(isAuthorizedReviewer("someone@school.edu")).toBe(false);
    expect(isAuthorizedReviewer("")).toBe(false);
  });

  it("denies everyone when the allowlist is only whitespace/commas", () => {
    process.env.REVIEWER_EMAILS = " , , ,";
    expect(isAuthorizedReviewer("someone@school.edu")).toBe(false);
  });

  it("normalizes both sides — leading/trailing whitespace and mixed case on the input email never bypass or under-match the allowlist", () => {
    process.env.REVIEWER_EMAILS = "reviewer@avela.app";
    expect(isAuthorizedReviewer("  Reviewer@Avela.App  ")).toBe(true);
    expect(isAuthorizedReviewer("reviewer@avela.app.evil.com")).toBe(false);
  });

  it("an empty-string input email is never accidentally matched by a blank allowlist entry", () => {
    process.env.REVIEWER_EMAILS = "reviewer@avela.app,,";
    expect(isAuthorizedReviewer("")).toBe(false);
  });
});

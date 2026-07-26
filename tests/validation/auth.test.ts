import { describe, expect, it } from "vitest";

import { loginSchema, mapAuthError, signupSchema } from "@/lib/validation/auth";

describe("loginSchema", () => {
  it("accepts a valid email and non-empty password", () => {
    const result = loginSchema.safeParse({
      email: "student@example.com",
      password: "anything",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "anything",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({
      email: "student@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("signupSchema", () => {
  const base = {
    email: "student@example.com",
    password: "abcd1234",
    confirmPassword: "abcd1234",
  };

  it("accepts a valid signup", () => {
    expect(signupSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = signupSchema.safeParse({
      ...base,
      password: "ab1",
      confirmPassword: "ab1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password with no digit", () => {
    const result = signupSchema.safeParse({
      ...base,
      password: "abcdefgh",
      confirmPassword: "abcdefgh",
    });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched passwords", () => {
    const result = signupSchema.safeParse({
      ...base,
      confirmPassword: "different1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      expect(fieldErrors.confirmPassword?.[0]).toMatch(/match/i);
    }
  });
});

describe("mapAuthError", () => {
  it("maps duplicate account errors", () => {
    expect(mapAuthError({ message: "User already registered" })).toMatch(
      /already exists/i
    );
  });

  it("maps invalid credential errors", () => {
    expect(mapAuthError({ message: "Invalid login credentials" })).toBe(
      "Incorrect email or password."
    );
  });

  it("falls back to a generic message for unrecognized errors", () => {
    expect(mapAuthError({ message: "some obscure postgres error" })).toBe(
      "Something went wrong. Please try again."
    );
  });
});

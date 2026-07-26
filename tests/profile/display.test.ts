import { describe, expect, it } from "vitest";

import { getDisplayName, getFirstName } from "@/lib/profile/display";

describe("getDisplayName", () => {
  it("prefers the display name when set", () => {
    expect(getDisplayName({ display_name: "Jamie Rivera", email: "jamie@example.com" })).toBe(
      "Jamie Rivera"
    );
  });

  it("falls back to email when display name is null", () => {
    expect(getDisplayName({ display_name: null, email: "jamie@example.com" })).toBe(
      "jamie@example.com"
    );
  });

  it("falls back to email when display name is blank", () => {
    expect(getDisplayName({ display_name: "   ", email: "jamie@example.com" })).toBe(
      "jamie@example.com"
    );
  });
});

describe("getFirstName", () => {
  it("returns just the first token of a multi-word name", () => {
    expect(getFirstName({ display_name: "Jamie Rivera", email: "jamie@example.com" })).toBe(
      "Jamie"
    );
  });

  it("returns the whole name when it's a single word", () => {
    expect(getFirstName({ display_name: "Jamie", email: "jamie@example.com" })).toBe("Jamie");
  });

  it("falls back to the email when there is no display name", () => {
    expect(getFirstName({ display_name: null, email: "jamie@example.com" })).toBe(
      "jamie@example.com"
    );
  });
});

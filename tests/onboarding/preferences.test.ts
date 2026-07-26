import { describe, expect, it } from "vitest";

import { describePreferences } from "@/lib/onboarding/preferences";

describe("describePreferences", () => {
  it("maps saved preference keys to their group and option labels", () => {
    expect(describePreferences(["virtual", "free_only"])).toEqual([
      { groupLabel: "Format", optionLabel: "Virtual" },
      { groupLabel: "Cost", optionLabel: "Free only" },
    ]);
  });

  it("returns results in PREFERENCE_GROUPS order regardless of input order", () => {
    expect(describePreferences(["free_only", "virtual"])).toEqual([
      { groupLabel: "Format", optionLabel: "Virtual" },
      { groupLabel: "Cost", optionLabel: "Free only" },
    ]);
  });

  it("returns an empty array for no preferences", () => {
    expect(describePreferences([])).toEqual([]);
  });
});

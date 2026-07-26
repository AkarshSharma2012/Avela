import { describe, expect, it, vi } from "vitest";

import { buildRpcArgs, completeOnboarding } from "@/lib/onboarding/complete";
import type { OnboardingData } from "@/lib/onboarding/schema";

const validData: OnboardingData = {
  preferredName: "Jamie",
  gradeLevel: 9,
  city: "Austin",
  state: "TX",
  country: "United States",
  interests: ["Technology", "Design"],
  otherInterestText: "",
  goals: ["Explore my interests"],
  preferences: ["virtual", "free_only"],
  weeklyAvailability: "2_to_5",
  experienceLevel: "beginner",
  guidedMode: true,
};

describe("buildRpcArgs", () => {
  it("maps validated data onto the RPC's argument shape", () => {
    const args = buildRpcArgs(validData);
    expect(args.p_display_name).toBe("Jamie");
    expect(args.p_grade_level).toBe(9);
    expect(args.p_city).toBe("Austin");
    expect(args.p_state).toBe("TX");
    expect(args.p_interests).toEqual(["Technology", "Design"]);
    expect(args.p_goals).toEqual(["Explore my interests"]);
    expect(args.p_preferences).toEqual(["virtual", "free_only"]);
    expect(args.p_guided_mode).toBe(true);
  });

  it("nulls out other_interest_text when 'Other' was not selected", () => {
    const args = buildRpcArgs(validData);
    expect(args.p_other_interest_text).toBeNull();
  });

  it("passes other_interest_text through when 'Other' was selected", () => {
    const args = buildRpcArgs({
      ...validData,
      interests: ["Other"],
      otherInterestText: "Robotics club",
    });
    expect(args.p_other_interest_text).toBe("Robotics club");
  });

  it("nulls out city/state when blank (non-US students)", () => {
    const args = buildRpcArgs({ ...validData, city: "", state: "", country: "Canada" });
    expect(args.p_city).toBeNull();
    expect(args.p_state).toBeNull();
  });
});

describe("completeOnboarding — completion only after successful save", () => {
  it("rejects invalid input without ever calling save", async () => {
    const save = vi.fn();

    const result = await completeOnboarding({ preferredName: "" }, save);

    expect(result.success).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it("calls save with well-formed args when input is valid, and reports success", async () => {
    const save = vi.fn().mockResolvedValue({ error: null });

    const result = await completeOnboarding(validData, save);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(buildRpcArgs(validData));
    expect(result).toEqual({ success: true });
  });

  it("reports failure (not success) when the save itself fails", async () => {
    const save = vi.fn().mockResolvedValue({ error: { message: "db unavailable" } });

    const result = await completeOnboarding(validData, save);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).not.toMatch(/db unavailable/);
    }
  });
});

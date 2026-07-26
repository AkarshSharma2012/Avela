import { describe, expect, it, vi } from "vitest";

import { buildRpcArgs, completeOnboarding } from "@/lib/onboarding/complete";
import {
  draftToFormEntries,
  EMPTY_DRAFT,
  parseOnboardingFormData,
  toOnboardingPayload,
  type OnboardingDraft,
} from "@/lib/onboarding/draft";
import { onboardingSchema } from "@/lib/onboarding/schema";

const filledDraft: OnboardingDraft = {
  ...EMPTY_DRAFT,
  step: 5,
  preferredName: "Jamie",
  gradeLevel: 9,
  city: "Austin",
  state: "TX",
  country: "United States",
  interests: ["Technology", "Design", "Other"],
  otherInterestText: "Robotics club",
  goals: ["Explore my interests", "Build a resume"],
  preferences: ["virtual", "free_only"],
  weeklyAvailability: "2_to_5",
  experienceLevel: "beginner",
  guidedMode: true,
};

function formDataFromDraft(draft: OnboardingDraft): FormData {
  const formData = new FormData();
  for (const entry of draftToFormEntries(draft)) {
    formData.append(entry.name, entry.value);
  }
  return formData;
}

describe("draftToFormEntries / parseOnboardingFormData round trip", () => {
  it("survives a real <form> submission (multi-value fields included) unchanged", () => {
    const formData = formDataFromDraft(filledDraft);
    const parsed = parseOnboardingFormData(formData);

    expect(parsed).toEqual(toOnboardingPayload(filledDraft));
  });

  it("carries every field the spec requires in the submitted payload", () => {
    const formData = formDataFromDraft(filledDraft);
    const parsed = parseOnboardingFormData(formData) as Record<string, unknown>;

    for (const field of [
      "preferredName",
      "gradeLevel",
      "city",
      "state",
      "country",
      "interests",
      "goals",
      "preferences",
      "weeklyAvailability",
      "experienceLevel",
      "guidedMode",
    ]) {
      expect(parsed).toHaveProperty(field);
    }
  });

  it("round-trips an empty/unanswered draft without throwing", () => {
    const formData = formDataFromDraft(EMPTY_DRAFT);
    const parsed = parseOnboardingFormData(formData);

    expect(parsed).toEqual(toOnboardingPayload(EMPTY_DRAFT));
  });

  it("decodes an unset grade level back to null, not NaN or 0", () => {
    const formData = formDataFromDraft(EMPTY_DRAFT);
    const parsed = parseOnboardingFormData(formData) as { gradeLevel: unknown };

    expect(parsed.gradeLevel).toBeNull();
  });

  it("decodes multi-value fields (interests/goals/preferences) as arrays", () => {
    const formData = formDataFromDraft(filledDraft);
    const parsed = parseOnboardingFormData(formData) as {
      interests: unknown;
      goals: unknown;
      preferences: unknown;
    };

    expect(parsed.interests).toEqual(["Technology", "Design", "Other"]);
    expect(parsed.goals).toEqual(["Explore my interests", "Build a resume"]);
    expect(parsed.preferences).toEqual(["virtual", "free_only"]);
  });
});

describe("submission pipeline via a real FormData object (as a <form action> would produce)", () => {
  it("completes successfully end-to-end for a fully valid submission", async () => {
    const save = vi.fn().mockResolvedValue({ error: null });
    const formData = formDataFromDraft(filledDraft);

    const result = await completeOnboarding(parseOnboardingFormData(formData), save);

    expect(result).toEqual({ success: true });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(
      buildRpcArgs(onboardingSchema.parse(toOnboardingPayload(filledDraft)))
    );
  });

  it("never calls save for an incomplete submission (e.g. missing required fields)", async () => {
    const save = vi.fn();
    const formData = formDataFromDraft(EMPTY_DRAFT);

    const result = await completeOnboarding(parseOnboardingFormData(formData), save);

    expect(result.success).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it("surfaces an RPC failure as a failed result, not a silent success", async () => {
    const save = vi.fn().mockResolvedValue({ error: { message: "connection reset" } });
    const formData = formDataFromDraft(filledDraft);

    const result = await completeOnboarding(parseOnboardingFormData(formData), save);

    expect(result.success).toBe(false);
    if (!result.success) {
      // The raw database error is never exposed to the client.
      expect(result.error).not.toMatch(/connection reset/);
    }
  });
});

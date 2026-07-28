import { describe, expect, it, vi } from "vitest";

import {
  buildFeedbackProfile,
  computeFeedbackSignal,
  giveFeedbackForUser,
  removeFeedbackForUser,
  type FeedbackInput,
} from "@/lib/opportunities/feedback";

describe("giveFeedbackForUser", () => {
  const noopWrite = vi.fn(async () => ({ error: null }));

  it("rejects when signed out, without ever calling the write function", async () => {
    const write = vi.fn(async () => ({ error: null }));
    const result = await giveFeedbackForUser(null, "opp-1", { feedbackType: "more_like_this" }, write);
    expect(result).toEqual({ success: false, error: "You need to be signed in to do that." });
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects a reason attached to anything other than a dismissal", async () => {
    const input: FeedbackInput = { feedbackType: "more_like_this", reason: "not_interested" };
    const result = await giveFeedbackForUser("user-1", "opp-1", input, noopWrite);
    expect(result.success).toBe(false);
  });

  it("rejects a reminder time attached to anything other than remind_later", async () => {
    const input: FeedbackInput = { feedbackType: "saved", reminderAt: new Date().toISOString() };
    const result = await giveFeedbackForUser("user-1", "opp-1", input, noopWrite);
    expect(result.success).toBe(false);
  });

  it("accepts a reason on a dismissal and passes it through to the write function", async () => {
    const write = vi.fn(async () => ({ error: null }));
    const result = await giveFeedbackForUser(
      "user-1",
      "opp-1",
      { feedbackType: "dismissed", reason: "too_expensive" },
      write
    );
    expect(result).toEqual({ success: true });
    expect(write).toHaveBeenCalledWith("user-1", "opp-1", { feedbackType: "dismissed", reason: "too_expensive" });
  });

  it("surfaces a friendly error when the write fails", async () => {
    const write = vi.fn(async () => ({ error: "db exploded" }));
    const result = await giveFeedbackForUser("user-1", "opp-1", { feedbackType: "saved" }, write);
    expect(result).toEqual({ success: false, error: "Couldn't save your response. Please try again." });
  });
});

describe("removeFeedbackForUser", () => {
  it("rejects when signed out", async () => {
    const remove = vi.fn(async () => ({ error: null }));
    const result = await removeFeedbackForUser(null, "opp-1", "dismissed", remove);
    expect(result.success).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });

  it("removes for a signed-in user", async () => {
    const remove = vi.fn(async () => ({ error: null }));
    const result = await removeFeedbackForUser("user-1", "opp-1", "dismissed", remove);
    expect(result).toEqual({ success: true });
    expect(remove).toHaveBeenCalledWith("user-1", "opp-1", "dismissed");
  });
});

describe("buildFeedbackProfile / computeFeedbackSignal", () => {
  it("scores a dismissal negative and a positive action positive", () => {
    const profile = buildFeedbackProfile([
      { feedbackType: "dismissed", opportunityType: "club" },
      { feedbackType: "more_like_this", opportunityType: "internship" },
    ]);
    expect(computeFeedbackSignal("club", profile)).toBe("penalize");
    expect(computeFeedbackSignal("internship", profile)).toBe("boost");
  });

  it("treats a type with no feedback history as neutral", () => {
    const profile = buildFeedbackProfile([{ feedbackType: "dismissed", opportunityType: "club" }]);
    expect(computeFeedbackSignal("scholarship", profile)).toBe("neutral");
  });

  it("never lets remind_later move the score in either direction", () => {
    const profile = buildFeedbackProfile([{ feedbackType: "remind_later", opportunityType: "research" }]);
    expect(computeFeedbackSignal("research", profile)).toBe("neutral");
  });

  it("nets out repeated feedback on the same type", () => {
    const profile = buildFeedbackProfile([
      { feedbackType: "dismissed", opportunityType: "internship" },
      { feedbackType: "dismissed", opportunityType: "internship" },
      { feedbackType: "more_like_this", opportunityType: "internship" },
    ]);
    expect(computeFeedbackSignal("internship", profile)).toBe("penalize");
  });
});

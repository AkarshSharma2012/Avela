import { describe, expect, it, vi } from "vitest";

import {
  buildPlanDefaults,
  computeDefaultTargetSubmitDate,
  deleteApplicationPlanForUser,
  ensureApplicationPlanForUser,
  updateApplicationPlanForUser,
  validateNotes,
  validateStatusTransition,
  validateTargetSubmitDate,
} from "@/lib/applications/plan";

const NOW = new Date("2026-07-27T12:00:00Z");

describe("computeDefaultTargetSubmitDate", () => {
  it("defaults to 3 days before a deadline that's comfortably in the future", () => {
    expect(computeDefaultTargetSubmitDate("2026-08-10T00:00:00Z", NOW)).toBe("2026-08-07");
  });

  it("falls back to today when the buffer would land in the past", () => {
    expect(computeDefaultTargetSubmitDate("2026-07-28T00:00:00Z", NOW)).toBe("2026-07-27");
  });

  it("returns null when the deadline is unknown", () => {
    expect(computeDefaultTargetSubmitDate(null, NOW)).toBeNull();
  });

  it("returns null when the deadline has already passed — nothing sensible to default to", () => {
    expect(computeDefaultTargetSubmitDate("2026-01-01T00:00:00Z", NOW)).toBeNull();
  });
});

describe("buildPlanDefaults", () => {
  it("always starts a new plan at 'planning', snapshotting the deadline as given", () => {
    const defaults = buildPlanDefaults("2026-08-10T00:00:00Z", NOW);
    expect(defaults.status).toBe("planning");
    expect(defaults.officialDeadline).toBe("2026-08-10T00:00:00Z");
    expect(defaults.targetSubmitDate).toBe("2026-08-07");
  });
});

describe("validateStatusTransition", () => {
  it("allows a no-op transition", () => {
    expect(validateStatusTransition("planning", "planning")).toBeNull();
  });

  it("allows free movement between non-decision statuses", () => {
    expect(validateStatusTransition("interested", "preparing")).toBeNull();
    expect(validateStatusTransition("ready_to_apply", "planning")).toBeNull();
  });

  it("rejects jumping straight to a decision before applying", () => {
    expect(validateStatusTransition("preparing", "accepted")).toMatch(/mark this as applied/i);
    expect(validateStatusTransition("interested", "rejected")).toMatch(/mark this as applied/i);
  });

  it("allows a decision once the plan has been marked applied", () => {
    expect(validateStatusTransition("applied", "accepted")).toBeNull();
    expect(validateStatusTransition("applied", "rejected")).toBeNull();
  });

  it("allows moving between decision outcomes without re-requiring applied", () => {
    expect(validateStatusTransition("accepted", "rejected")).toBeNull();
  });

  it("allows withdrawing from any status", () => {
    expect(validateStatusTransition("planning", "withdrawn")).toBeNull();
    expect(validateStatusTransition("applied", "withdrawn")).toBeNull();
  });
});

describe("validateTargetSubmitDate", () => {
  it("passes when either date is unknown", () => {
    expect(validateTargetSubmitDate(null, "2026-08-10T00:00:00Z")).toBeNull();
    expect(validateTargetSubmitDate("2026-08-01", null)).toBeNull();
  });

  it("rejects a target date after the official deadline", () => {
    expect(validateTargetSubmitDate("2026-08-15", "2026-08-10T00:00:00Z")).toMatch(/can't be after/i);
  });

  it("accepts a target date on or before the deadline", () => {
    expect(validateTargetSubmitDate("2026-08-05", "2026-08-10T00:00:00Z")).toBeNull();
  });
});

describe("validateNotes", () => {
  it("accepts null and reasonably short notes", () => {
    expect(validateNotes(null)).toBeNull();
    expect(validateNotes("Talked to my counselor about this.")).toBeNull();
  });

  it("rejects notes over the length cap", () => {
    expect(validateNotes("a".repeat(5001))).toMatch(/too long/i);
  });
});

describe("ensureApplicationPlanForUser", () => {
  it("never calls ensure() when signed out", async () => {
    const ensure = vi.fn();
    const result = await ensureApplicationPlanForUser(null, "opp-1", null, ensure, NOW);
    expect(result).toEqual({ success: false, error: "You need to be signed in to start an application." });
    expect(ensure).not.toHaveBeenCalled();
  });

  it("passes the computed defaults through to ensure()", async () => {
    const ensure = vi.fn(async () => ({ planId: "plan-1", error: null }));
    const result = await ensureApplicationPlanForUser("user-1", "opp-1", "2026-08-10T00:00:00Z", ensure, NOW);

    expect(result).toEqual({ success: true, planId: "plan-1" });
    expect(ensure).toHaveBeenCalledExactlyOnceWith("user-1", "opp-1", {
      status: "planning",
      officialDeadline: "2026-08-10T00:00:00Z",
      targetSubmitDate: "2026-08-07",
    });
  });

  it("surfaces a friendly error when ensure() fails", async () => {
    const ensure = vi.fn(async () => ({ planId: null, error: "db exploded" }));
    const result = await ensureApplicationPlanForUser("user-1", "opp-1", null, ensure, NOW);
    expect(result).toEqual({ success: false, error: "Couldn't start your application. Please try again." });
  });
});

const CURRENT_PLANNING = { status: "planning" as const, officialDeadline: "2026-08-10T00:00:00Z", submittedAt: null, decisionAt: null };

describe("updateApplicationPlanForUser", () => {
  it("never calls write() when signed out", async () => {
    const write = vi.fn();
    const result = await updateApplicationPlanForUser(null, "plan-1", CURRENT_PLANNING, { notes: "hi" }, write, NOW);
    expect(result.success).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects an invalid status transition before ever calling write()", async () => {
    const write = vi.fn();
    const result = await updateApplicationPlanForUser("user-1", "plan-1", CURRENT_PLANNING, { status: "accepted" }, write, NOW);
    expect(result.success).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects a target date after the snapshot deadline", async () => {
    const write = vi.fn();
    const result = await updateApplicationPlanForUser(
      "user-1",
      "plan-1",
      CURRENT_PLANNING,
      { targetSubmitDate: "2026-09-01" },
      write,
      NOW
    );
    expect(result.success).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it("stamps submitted_at exactly once, the first time status becomes 'applied'", async () => {
    const write = vi.fn(async () => ({ error: null }));
    await updateApplicationPlanForUser("user-1", "plan-1", CURRENT_PLANNING, { status: "applied" }, write, NOW);
    expect(write).toHaveBeenCalledWith("user-1", "plan-1", { status: "applied", submittedAt: NOW.toISOString() });

    write.mockClear();
    const alreadyApplied = { ...CURRENT_PLANNING, status: "applied" as const, submittedAt: "2026-07-01T00:00:00Z" };
    await updateApplicationPlanForUser("user-1", "plan-1", alreadyApplied, { notes: "still working on it" }, write, NOW);
    expect(write).toHaveBeenCalledWith("user-1", "plan-1", { notes: "still working on it" });
  });

  it("stamps decision_at exactly once, the first time a decision is recorded", async () => {
    const write = vi.fn(async () => ({ error: null }));
    const applied = { ...CURRENT_PLANNING, status: "applied" as const, submittedAt: "2026-07-01T00:00:00Z" };
    await updateApplicationPlanForUser("user-1", "plan-1", applied, { status: "accepted" }, write, NOW);
    expect(write).toHaveBeenCalledWith("user-1", "plan-1", { status: "accepted", decisionAt: NOW.toISOString() });

    write.mockClear();
    const decided = { ...applied, status: "accepted" as const, decisionAt: "2026-07-15T00:00:00Z" };
    await updateApplicationPlanForUser("user-1", "plan-1", decided, { status: "rejected" }, write, NOW);
    expect(write).toHaveBeenCalledWith("user-1", "plan-1", { status: "rejected" });
  });

  it("surfaces a friendly error when write() fails", async () => {
    const write = vi.fn(async () => ({ error: "constraint violation" }));
    const result = await updateApplicationPlanForUser("user-1", "plan-1", CURRENT_PLANNING, { notes: "x" }, write, NOW);
    expect(result).toEqual({ success: false, error: "Couldn't save your changes. Please try again." });
  });
});

describe("deleteApplicationPlanForUser", () => {
  it("never calls remove() when signed out", async () => {
    const remove = vi.fn();
    const result = await deleteApplicationPlanForUser(null, "plan-1", remove);
    expect(result.success).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });

  it("removes for a signed-in user", async () => {
    const remove = vi.fn(async () => ({ error: null }));
    const result = await deleteApplicationPlanForUser("user-1", "plan-1", remove);
    expect(result).toEqual({ success: true });
    expect(remove).toHaveBeenCalledExactlyOnceWith("user-1", "plan-1");
  });
});

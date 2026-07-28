import { describe, expect, it } from "vitest";

import {
  completeReminderForUser,
  createCustomReminderForUser,
  dismissReminderForUser,
  reopenReminderForUser,
  snoozeReminderForUser,
  validateReminderMessage,
  validateReminderTitle,
  validateRemindAt,
  validateSnoozeDate,
} from "@/lib/reminders/validation";

const NOW = new Date("2026-07-27T12:00:00Z");

describe("validateReminderTitle", () => {
  it("rejects an empty or whitespace-only title", () => {
    expect(validateReminderTitle("")).not.toBeNull();
    expect(validateReminderTitle("   ")).not.toBeNull();
  });

  it("rejects an overly long title", () => {
    expect(validateReminderTitle("a".repeat(201))).not.toBeNull();
  });

  it("accepts a normal title", () => {
    expect(validateReminderTitle("Ask my counselor for a transcript")).toBeNull();
  });
});

describe("validateReminderMessage", () => {
  it("allows null", () => {
    expect(validateReminderMessage(null)).toBeNull();
  });

  it("rejects an overly long message", () => {
    expect(validateReminderMessage("a".repeat(2001))).not.toBeNull();
  });
});

describe("validateRemindAt", () => {
  it("rejects an unparseable date", () => {
    expect(validateRemindAt("not-a-date", NOW)).not.toBeNull();
  });

  it("rejects a date in the past", () => {
    expect(validateRemindAt("2026-01-01T00:00:00Z", NOW)).not.toBeNull();
  });

  it("accepts a future date", () => {
    expect(validateRemindAt("2026-08-01T00:00:00Z", NOW)).toBeNull();
  });
});

describe("validateSnoozeDate", () => {
  it("rejects a snooze date in the past or right now", () => {
    expect(validateSnoozeDate("2026-01-01T00:00:00Z", NOW)).not.toBeNull();
    expect(validateSnoozeDate(NOW.toISOString(), NOW)).not.toBeNull();
  });

  it("accepts a future snooze date", () => {
    expect(validateSnoozeDate("2026-08-01T00:00:00Z", NOW)).toBeNull();
  });
});

describe("createCustomReminderForUser", () => {
  const validInput = { title: "Draft my essay", remindAt: "2026-08-01T00:00:00Z" };

  it("requires a signed-in user", async () => {
    const create = async () => ({ reminderId: "r1", error: null });
    const result = await createCustomReminderForUser(null, validInput, create, NOW);
    expect(result).toEqual({ success: false, error: "You need to be signed in to set a reminder." });
  });

  it("rejects an invalid title before ever calling the write function", async () => {
    let called = false;
    const create = async () => {
      called = true;
      return { reminderId: "r1", error: null };
    };
    const result = await createCustomReminderForUser("user-1", { ...validInput, title: "" }, create, NOW);
    expect(result.success).toBe(false);
    expect(called).toBe(false);
  });

  it("rejects a past remind_at before ever calling the write function", async () => {
    let called = false;
    const create = async () => {
      called = true;
      return { reminderId: "r1", error: null };
    };
    const result = await createCustomReminderForUser("user-1", { ...validInput, remindAt: "2026-01-01T00:00:00Z" }, create, NOW);
    expect(result.success).toBe(false);
    expect(called).toBe(false);
  });

  it("creates with source always forced to student_created", async () => {
    let receivedSource: string | null = null;
    const create = async (_userId: string, input: { source: string }) => {
      receivedSource = input.source;
      return { reminderId: "r1", error: null };
    };
    const result = await createCustomReminderForUser("user-1", validInput, create, NOW);
    expect(result).toEqual({ success: true, reminderId: "r1" });
    expect(receivedSource).toBe("student_created");
  });

  it("surfaces a friendly error when the write fails", async () => {
    const create = async () => ({ reminderId: null, error: "insert failed" });
    const result = await createCustomReminderForUser("user-1", validInput, create, NOW);
    expect(result.success).toBe(false);
  });
});

describe("owner-only mutation helpers", () => {
  it("completeReminderForUser requires a signed-in user", async () => {
    const complete = async () => ({ error: null });
    const result = await completeReminderForUser(null, "reminder-1", complete);
    expect(result.success).toBe(false);
  });

  it("reopenReminderForUser requires a signed-in user", async () => {
    const reopen = async () => ({ error: null });
    const result = await reopenReminderForUser(null, "reminder-1", reopen);
    expect(result.success).toBe(false);
  });

  it("dismissReminderForUser requires a signed-in user", async () => {
    const dismiss = async () => ({ error: null });
    const result = await dismissReminderForUser(null, "reminder-1", dismiss);
    expect(result.success).toBe(false);
  });

  it("succeeds and delegates to the injected write function when signed in", async () => {
    let calledWith: [string, string] | null = null;
    const complete = async (userId: string, id: string) => {
      calledWith = [userId, id];
      return { error: null };
    };
    const result = await completeReminderForUser("user-1", "reminder-1", complete);
    expect(result).toEqual({ success: true });
    expect(calledWith).toEqual(["user-1", "reminder-1"]);
  });
});

describe("snoozeReminderForUser", () => {
  it("requires a signed-in user", async () => {
    const snooze = async () => ({ error: null });
    const result = await snoozeReminderForUser(null, "reminder-1", "2026-08-01T00:00:00Z", snooze, NOW);
    expect(result.success).toBe(false);
  });

  it("rejects a past snooze date before calling the write function", async () => {
    let called = false;
    const snooze = async () => {
      called = true;
      return { error: null };
    };
    const result = await snoozeReminderForUser("user-1", "reminder-1", "2026-01-01T00:00:00Z", snooze, NOW);
    expect(result.success).toBe(false);
    expect(called).toBe(false);
  });

  it("snoozes to a valid future date", async () => {
    const snooze = async () => ({ error: null });
    const result = await snoozeReminderForUser("user-1", "reminder-1", "2026-08-01T00:00:00Z", snooze, NOW);
    expect(result).toEqual({ success: true });
  });
});

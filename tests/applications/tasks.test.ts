import { describe, expect, it, vi } from "vitest";

import {
  createApplicationTaskForUser,
  deleteApplicationTaskForUser,
  isTaskOverdue,
  setApplicationTaskCompletionForUser,
  updateApplicationTaskForUser,
  validateTaskDescription,
  validateTaskTitle,
} from "@/lib/applications/tasks";

describe("validateTaskTitle", () => {
  it("rejects an empty or whitespace-only title", () => {
    expect(validateTaskTitle("")).toMatch(/give this task a title/i);
    expect(validateTaskTitle("   ")).toMatch(/give this task a title/i);
  });

  it("rejects an unreasonably long title", () => {
    expect(validateTaskTitle("a".repeat(201))).toMatch(/too long/i);
  });

  it("accepts a normal title", () => {
    expect(validateTaskTitle("Request a recommendation")).toBeNull();
  });
});

describe("validateTaskDescription", () => {
  it("accepts null and short descriptions", () => {
    expect(validateTaskDescription(null)).toBeNull();
    expect(validateTaskDescription("Ask early.")).toBeNull();
  });

  it("rejects an unreasonably long description", () => {
    expect(validateTaskDescription("a".repeat(2001))).toMatch(/too long/i);
  });
});

describe("createApplicationTaskForUser", () => {
  it("never calls create() when signed out", async () => {
    const create = vi.fn();
    const result = await createApplicationTaskForUser(null, "plan-1", { title: "Draft essay" }, create);
    expect(result.success).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an invalid title before calling create()", async () => {
    const create = vi.fn();
    const result = await createApplicationTaskForUser("user-1", "plan-1", { title: "" }, create);
    expect(result.success).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("creates for a signed-in user with a valid title", async () => {
    const create = vi.fn(async () => ({ taskId: "task-1", error: null }));
    const result = await createApplicationTaskForUser("user-1", "plan-1", { title: "Draft essay" }, create);
    expect(result).toEqual({ success: true, taskId: "task-1" });
    expect(create).toHaveBeenCalledExactlyOnceWith("user-1", "plan-1", { title: "Draft essay" });
  });
});

describe("updateApplicationTaskForUser", () => {
  it("never calls write() when signed out", async () => {
    const write = vi.fn();
    const result = await updateApplicationTaskForUser(null, "task-1", { title: "New title" }, write);
    expect(result.success).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects an invalid title update", async () => {
    const write = vi.fn();
    const result = await updateApplicationTaskForUser("user-1", "task-1", { title: "  " }, write);
    expect(result.success).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it("writes a valid update", async () => {
    const write = vi.fn(async () => ({ error: null }));
    const result = await updateApplicationTaskForUser("user-1", "task-1", { dueDate: "2026-08-01" }, write);
    expect(result).toEqual({ success: true });
    expect(write).toHaveBeenCalledExactlyOnceWith("user-1", "task-1", { dueDate: "2026-08-01" });
  });
});

describe("setApplicationTaskCompletionForUser", () => {
  const NOW = new Date("2026-07-27T12:00:00Z");

  it("never calls write() when signed out", async () => {
    const write = vi.fn();
    const result = await setApplicationTaskCompletionForUser(null, "task-1", true, write, NOW);
    expect(result.success).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it("marks complete with a real timestamp, never a plain boolean", async () => {
    const write = vi.fn(async () => ({ error: null }));
    await setApplicationTaskCompletionForUser("user-1", "task-1", true, write, NOW);
    expect(write).toHaveBeenCalledExactlyOnceWith("user-1", "task-1", NOW.toISOString());
  });

  it("uncompletes by clearing the timestamp", async () => {
    const write = vi.fn(async () => ({ error: null }));
    await setApplicationTaskCompletionForUser("user-1", "task-1", false, write, NOW);
    expect(write).toHaveBeenCalledExactlyOnceWith("user-1", "task-1", null);
  });
});

describe("deleteApplicationTaskForUser", () => {
  it("never calls remove() when signed out", async () => {
    const remove = vi.fn();
    const result = await deleteApplicationTaskForUser(null, "task-1", remove);
    expect(result.success).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });

  it("removes for a signed-in user", async () => {
    const remove = vi.fn(async () => ({ error: null }));
    const result = await deleteApplicationTaskForUser("user-1", "task-1", remove);
    expect(result).toEqual({ success: true });
  });
});

describe("isTaskOverdue", () => {
  const NOW = new Date("2026-07-27T12:00:00Z");

  it("is never overdue without a due date", () => {
    expect(isTaskOverdue(null, null, NOW)).toBe(false);
  });

  it("is never overdue once completed, regardless of the due date", () => {
    expect(isTaskOverdue("2026-01-01", "2026-07-01T00:00:00Z", NOW)).toBe(false);
  });

  it("is not overdue on its due date — only the day after", () => {
    expect(isTaskOverdue("2026-07-27", null, NOW)).toBe(false);
  });

  it("is overdue once the due date has passed", () => {
    expect(isTaskOverdue("2026-07-26", null, NOW)).toBe(true);
  });

  it("is not overdue for a future due date", () => {
    expect(isTaskOverdue("2026-08-01", null, NOW)).toBe(false);
  });
});

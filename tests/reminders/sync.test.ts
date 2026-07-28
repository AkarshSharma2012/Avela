import { describe, expect, it } from "vitest";

import {
  buildApplicationTaskReminders,
  buildOpportunityDeadlineReminders,
  buildRecommendationReminders,
  buildTargetSubmitDateReminders,
  type PlanForReminders,
  type TaskForReminders,
} from "@/lib/reminders/sync";

const NOW = new Date("2026-07-27T12:00:00Z");

function plan(overrides: Partial<PlanForReminders> = {}): PlanForReminders {
  return {
    planId: "plan-1",
    opportunityId: "opp-1",
    opportunityTitle: "Summer Research Program",
    isActiveStatus: true,
    officialDeadline: null,
    targetSubmitDate: null,
    ...overrides,
  };
}

function task(overrides: Partial<TaskForReminders> = {}): TaskForReminders {
  return {
    taskId: "task-1",
    planId: "plan-1",
    opportunityTitle: "Summer Research Program",
    title: "Request a recommendation",
    dueDate: null,
    completedAt: null,
    ...overrides,
  };
}

describe("buildOpportunityDeadlineReminders — automatic reminder generation", () => {
  it("generates one occurrence per configured offset (14 and 3 days before), each with a stable dedupe key", () => {
    const writes = buildOpportunityDeadlineReminders([plan({ officialDeadline: "2026-09-01T00:00:00Z" })], NOW);
    expect(writes).toHaveLength(2);
    expect(writes.map((w) => w.dedupeKey)).toEqual(["opportunity_deadline:opp-1:14", "opportunity_deadline:opp-1:3"]);
    for (const write of writes) {
      expect(write.reminderType).toBe("opportunity_deadline");
      expect(write.source).toBe("automatic");
      expect(write.opportunityId).toBe("opp-1");
    }
  });

  it("re-running with the same input produces the exact same dedupe keys — duplicate prevention", () => {
    const first = buildOpportunityDeadlineReminders([plan({ officialDeadline: "2026-09-01T00:00:00Z" })], NOW);
    const second = buildOpportunityDeadlineReminders([plan({ officialDeadline: "2026-09-01T00:00:00Z" })], NOW);
    expect(second.map((w) => w.dedupeKey)).toEqual(first.map((w) => w.dedupeKey));
  });

  it("produces nothing for a plan with no known official deadline", () => {
    expect(buildOpportunityDeadlineReminders([plan({ officialDeadline: null })], NOW)).toEqual([]);
  });

  it("expired opportunity behavior: an already-passed deadline produces zero reminders, never a fake future one", () => {
    const writes = buildOpportunityDeadlineReminders([plan({ officialDeadline: "2026-01-01T00:00:00Z" })], NOW);
    expect(writes).toEqual([]);
  });
});

describe("buildTargetSubmitDateReminders — target date synchronization", () => {
  it("generates reminders from an active plan's target submit date", () => {
    const writes = buildTargetSubmitDateReminders([plan({ targetSubmitDate: "2026-08-15" })], NOW);
    expect(writes.length).toBeGreaterThan(0);
    expect(writes[0].applicationPlanId).toBe("plan-1");
    expect(writes[0].source).toBe("application_plan");
  });

  it("moving the target date later moves the generated remind_at accordingly", () => {
    const before = buildTargetSubmitDateReminders([plan({ targetSubmitDate: "2026-08-05" })], NOW);
    const after = buildTargetSubmitDateReminders([plan({ targetSubmitDate: "2026-08-20" })], NOW);
    expect(new Date(after[0].remindAt).getTime()).toBeGreaterThan(new Date(before[0].remindAt).getTime());
    // Same dedupe key (same plan, same offset) — an update in place, not a new row.
    expect(after[0].dedupeKey).toBe(before[0].dedupeKey);
  });

  it("produces nothing once a plan has left the active workflow", () => {
    const writes = buildTargetSubmitDateReminders(
      [plan({ targetSubmitDate: "2026-08-15", isActiveStatus: false })],
      NOW
    );
    expect(writes).toEqual([]);
  });

  it("produces nothing when no target date is set", () => {
    expect(buildTargetSubmitDateReminders([plan({ targetSubmitDate: null })], NOW)).toEqual([]);
  });
});

describe("buildApplicationTaskReminders — task date & completion synchronization", () => {
  it("generates reminders from an open task's due date", () => {
    const writes = buildApplicationTaskReminders([task({ dueDate: "2026-08-10" })], NOW);
    expect(writes.length).toBeGreaterThan(0);
    expect(writes[0].applicationTaskId).toBe("task-1");
    expect(writes[0].source).toBe("application_task");
  });

  it("changing the due date changes the computed remind_at but keeps the same dedupe key", () => {
    const before = buildApplicationTaskReminders([task({ dueDate: "2026-08-05" })], NOW);
    const after = buildApplicationTaskReminders([task({ dueDate: "2026-08-20" })], NOW);
    expect(after[0].remindAt).not.toBe(before[0].remindAt);
    expect(after[0].dedupeKey).toBe(before[0].dedupeKey);
  });

  it("produces nothing for a completed task — completion hides its automatic reminders", () => {
    const writes = buildApplicationTaskReminders([task({ dueDate: "2026-08-10", completedAt: NOW.toISOString() })], NOW);
    expect(writes).toEqual([]);
  });

  it("produces nothing for a task with no due date", () => {
    expect(buildApplicationTaskReminders([task({ dueDate: null })], NOW)).toEqual([]);
  });
});

describe("buildRecommendationReminders — recommendation reminder synchronization", () => {
  it("mirrors a remind-later feedback row into a reminder at exactly the chosen time", () => {
    const writes = buildRecommendationReminders(
      [{ opportunityId: "opp-1", opportunityTitle: "Summer Research Program", reminderAt: "2026-08-01T15:00:00Z" }],
      NOW
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      dedupeKey: "recommendation_reminder:opp-1",
      reminderType: "recommendation_reminder",
      source: "recommendation_feedback",
      remindAt: "2026-08-01T15:00:00.000Z",
      opportunityId: "opp-1",
    });
  });

  it("skips a remind-later time that has already passed", () => {
    const writes = buildRecommendationReminders(
      [{ opportunityId: "opp-1", opportunityTitle: "x", reminderAt: "2026-01-01T00:00:00Z" }],
      NOW
    );
    expect(writes).toEqual([]);
  });

  it("uses a stable dedupe key per opportunity, so re-syncing the same feedback never duplicates", () => {
    const feedback = [{ opportunityId: "opp-1", opportunityTitle: "x", reminderAt: "2026-08-01T00:00:00Z" }];
    const first = buildRecommendationReminders(feedback, NOW);
    const second = buildRecommendationReminders(feedback, NOW);
    expect(first[0].dedupeKey).toBe(second[0].dedupeKey);
  });
});

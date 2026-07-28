import { describe, expect, it } from "vitest";

import {
  buildDashboardApplicationSummary,
  computePlanProgress,
  planDueDate,
  planNeedsAttention,
  type DashboardApplicationInput,
} from "@/lib/applications/summary";

const NOW = new Date("2026-07-27T12:00:00Z");

describe("computePlanProgress", () => {
  it("reports 0/0/0 for an empty checklist", () => {
    expect(computePlanProgress([])).toEqual({ completed: 0, total: 0, percent: 0 });
  });

  it("counts completed tasks and rounds the percent", () => {
    const tasks = [
      { due_date: null, completed_at: "2026-07-01T00:00:00Z" },
      { due_date: null, completed_at: null },
      { due_date: null, completed_at: null },
    ];
    expect(computePlanProgress(tasks)).toEqual({ completed: 1, total: 3, percent: 33 });
  });
});

describe("planDueDate", () => {
  it("prefers the student's own target date", () => {
    expect(planDueDate({ target_submit_date: "2026-08-01", official_deadline: "2026-08-10T00:00:00Z" })).toBe("2026-08-01");
  });

  it("falls back to the official deadline's date part", () => {
    expect(planDueDate({ target_submit_date: null, official_deadline: "2026-08-10T23:59:00Z" })).toBe("2026-08-10");
  });

  it("is null when neither is known", () => {
    expect(planDueDate({ target_submit_date: null, official_deadline: null })).toBeNull();
  });
});

describe("planNeedsAttention", () => {
  it("never flags a plan that isn't active (applied, decided, or withdrawn)", () => {
    const bundle = {
      plan: { status: "applied" as const, target_submit_date: null, official_deadline: null },
      tasks: [{ due_date: "2026-01-01", completed_at: null }],
    };
    expect(planNeedsAttention(bundle, NOW)).toBeNull();
  });

  it("flags overdue tasks", () => {
    const bundle = {
      plan: { status: "preparing" as const, target_submit_date: "2026-12-01", official_deadline: null },
      tasks: [{ due_date: "2026-07-01", completed_at: null }],
    };
    const attention = planNeedsAttention(bundle, NOW);
    expect(attention?.reasons).toContain("overdue_tasks");
    expect(attention?.overdueTaskCount).toBe(1);
  });

  it("flags a deadline inside the attention window", () => {
    const bundle = {
      plan: { status: "planning" as const, target_submit_date: "2026-07-30", official_deadline: null },
      tasks: [],
    };
    expect(planNeedsAttention(bundle, NOW)?.reasons).toContain("deadline_soon");
  });

  it("flags a missing target date once a student has moved past 'interested'", () => {
    const bundle = {
      plan: { status: "planning" as const, target_submit_date: null, official_deadline: null },
      tasks: [],
    };
    expect(planNeedsAttention(bundle, NOW)?.reasons).toContain("no_target_date");
  });

  it("never flags a plan still at 'interested' just for having no target date yet", () => {
    const bundle = {
      plan: { status: "interested" as const, target_submit_date: null, official_deadline: null },
      tasks: [],
    };
    expect(planNeedsAttention(bundle, NOW)).toBeNull();
  });

  it("returns null for an active plan with no overdue tasks and a comfortably far deadline", () => {
    const bundle = {
      plan: { status: "planning" as const, target_submit_date: "2026-12-01", official_deadline: null },
      tasks: [{ due_date: "2026-12-01", completed_at: null }],
    };
    expect(planNeedsAttention(bundle, NOW)).toBeNull();
  });
});

describe("buildDashboardApplicationSummary", () => {
  function input(overrides: Partial<DashboardApplicationInput> = {}): DashboardApplicationInput {
    return {
      planId: "plan-1",
      status: "planning",
      targetSubmitDate: null,
      officialDeadline: null,
      opportunityTitle: "Some Program",
      tasks: [],
      ...overrides,
    };
  }

  it("counts only active-status plans toward activeCount", () => {
    const summary = buildDashboardApplicationSummary(
      [input({ status: "planning" }), input({ status: "applied" }), input({ status: "withdrawn" })],
      NOW
    );
    expect(summary.activeCount).toBe(1);
  });

  it("counts overdue tasks across every plan, active or not", () => {
    const overdueTask = { due_date: "2026-07-01", completed_at: null };
    const summary = buildDashboardApplicationSummary(
      [input({ status: "applied", tasks: [overdueTask] }), input({ status: "planning", tasks: [overdueTask] })],
      NOW
    );
    expect(summary.overdueTaskCount).toBe(2);
  });

  it("surfaces the soonest upcoming deadline among active plans only", () => {
    const summary = buildDashboardApplicationSummary(
      [
        input({ planId: "plan-far", opportunityTitle: "Far", targetSubmitDate: "2026-12-01" }),
        input({ planId: "plan-near", opportunityTitle: "Near", targetSubmitDate: "2026-08-01" }),
        input({ planId: "plan-done", status: "applied", opportunityTitle: "Done", targetSubmitDate: "2026-07-28" }),
      ],
      NOW
    );
    expect(summary.nearestDeadline).toEqual({ planId: "plan-near", opportunityTitle: "Near", date: "2026-08-01" });
  });

  it("is null when no active plan has a known date", () => {
    const summary = buildDashboardApplicationSummary([input({ status: "planning" })], NOW);
    expect(summary.nearestDeadline).toBeNull();
  });
});

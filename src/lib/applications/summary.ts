/**
 * Dependency-free aggregation over already-loaded plans/tasks — no
 * Supabase client, so the Application Center's grouping and the
 * dashboard's small summary card are both unit-testable without a
 * database.
 */

import { isActiveApplicationStatus } from "@/lib/applications/constants";
import { isTaskOverdue } from "@/lib/applications/tasks";
import type { ApplicationPlanStatus } from "@/types/database";

export type TaskLike = { due_date: string | null; completed_at: string | null };

export type PlanProgress = { completed: number; total: number; percent: number };

export function computePlanProgress(tasks: readonly TaskLike[]): PlanProgress {
  const total = tasks.length;
  const completed = tasks.filter((task) => task.completed_at !== null).length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { completed, total, percent };
}

/** The soonest date a plan should be acted on — the student's own target if set, otherwise the official deadline (date part only, since target dates are date-only). */
export function planDueDate(plan: { target_submit_date: string | null; official_deadline: string | null }): string | null {
  if (plan.target_submit_date) return plan.target_submit_date;
  if (plan.official_deadline) return plan.official_deadline.slice(0, 10);
  return null;
}

const ATTENTION_WINDOW_DAYS = 7;

export type AttentionReason = "overdue_tasks" | "deadline_soon" | "no_target_date";

export type PlanBundle<TPlan extends { status: ApplicationPlanStatus } = { status: ApplicationPlanStatus }> = {
  plan: TPlan;
  tasks: readonly TaskLike[];
};

export type AttentionEntry<TPlan> = { plan: TPlan; reasons: AttentionReason[]; overdueTaskCount: number };

/**
 * A single active plan's reasons (if any) it belongs in "needing
 * attention" — overdue checklist items, a deadline inside the next week,
 * or no target date set at all once a student has moved past just being
 * "interested". Plans already applied/decided/withdrawn never need
 * attention in this sense; they've left the active workflow.
 */
export function planNeedsAttention<TPlan extends { status: ApplicationPlanStatus; target_submit_date: string | null; official_deadline: string | null }>(
  bundle: PlanBundle<TPlan>,
  now: Date = new Date()
): AttentionEntry<TPlan> | null {
  if (!isActiveApplicationStatus(bundle.plan.status)) return null;

  const overdueTaskCount = bundle.tasks.filter((task) => isTaskOverdue(task.due_date, task.completed_at, now)).length;
  const reasons: AttentionReason[] = [];
  if (overdueTaskCount > 0) reasons.push("overdue_tasks");

  const dueDate = planDueDate(bundle.plan);
  if (dueDate !== null) {
    const daysUntil = Math.floor((new Date(dueDate).getTime() - now.getTime()) / 86_400_000);
    if (daysUntil <= ATTENTION_WINDOW_DAYS) reasons.push("deadline_soon");
  } else if (bundle.plan.status !== "interested") {
    reasons.push("no_target_date");
  }

  if (reasons.length === 0) return null;
  return { plan: bundle.plan, reasons, overdueTaskCount };
}

export type DashboardApplicationInput = {
  planId: string;
  status: ApplicationPlanStatus;
  targetSubmitDate: string | null;
  officialDeadline: string | null;
  opportunityTitle: string;
  tasks: readonly TaskLike[];
};

export type DashboardApplicationSummary = {
  activeCount: number;
  overdueTaskCount: number;
  nearestDeadline: { planId: string; opportunityTitle: string; date: string } | null;
  /** Active plans due within DEADLINE_WINDOW_DAYS (inclusive), never overdue ones — those are already counted separately via overdueTaskCount. Powers the dashboard's "Deadlines" metric tile. */
  upcomingDeadlineCount: number;
};

/** Window used by `upcomingDeadlineCount` — matches the dashboard MetricTile's "next 14 days" label. */
const DEADLINE_WINDOW_DAYS = 14;

/** The dashboard's deliberately small "Applications" card — see AGENTS' spec section 7: nearest deadline, overdue task count, active count, nothing more. */
export function buildDashboardApplicationSummary(
  inputs: readonly DashboardApplicationInput[],
  now: Date = new Date()
): DashboardApplicationSummary {
  const active = inputs.filter((input) => isActiveApplicationStatus(input.status));

  const overdueTaskCount = inputs.reduce(
    (sum, input) => sum + input.tasks.filter((task) => isTaskOverdue(task.due_date, task.completed_at, now)).length,
    0
  );

  const upcoming = active
    .map((input) => ({
      planId: input.planId,
      opportunityTitle: input.opportunityTitle,
      date: input.targetSubmitDate ?? (input.officialDeadline ? input.officialDeadline.slice(0, 10) : null),
    }))
    .filter((entry): entry is { planId: string; opportunityTitle: string; date: string } => entry.date !== null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const upcomingDeadlineCount = upcoming.filter((entry) => {
    const daysUntil = Math.floor((new Date(entry.date).getTime() - now.getTime()) / 86_400_000);
    return daysUntil >= 0 && daysUntil <= DEADLINE_WINDOW_DAYS;
  }).length;

  return {
    activeCount: active.length,
    overdueTaskCount,
    nearestDeadline: upcoming[0] ?? null,
    upcomingDeadlineCount,
  };
}

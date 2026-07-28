import Link from "next/link";
import { ArrowRight, TriangleAlert } from "lucide-react";

import { ApplicationStatusBadge } from "@/components/applications/application-status-badge";
import { ProgressBar } from "@/components/applications/progress-bar";
import { Chip } from "@/components/ui/chip";
import { computePlanProgress, planDueDate } from "@/lib/applications/summary";
import { isTaskOverdue } from "@/lib/applications/tasks";
import { isOpportunityClosedOrExpired } from "@/lib/applications/opportunity-status";
import { formatShortDate } from "@/lib/opportunities/format";
import { cn } from "@/lib/utils";
import type { ApplicationPlanBundle } from "@/lib/applications/repository";

function ApplicationPlanCard({ bundle, now = new Date() }: { bundle: ApplicationPlanBundle; now?: Date }) {
  const { plan, opportunity, tasks } = bundle;
  const progress = computePlanProgress(tasks);
  const overdueCount = tasks.filter((task) => isTaskOverdue(task.due_date, task.completed_at, now)).length;
  const dueDate = planDueDate(plan);
  const closedOrExpired = isOpportunityClosedOrExpired(opportunity);

  return (
    <article className="flex flex-col gap-3 rounded-md border border-border bg-card px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-base text-foreground">
            <Link
              href={`/applications/${plan.id}`}
              className="rounded-sm hover:underline focus-visible:underline focus-visible:outline-none"
            >
              {opportunity.title}
            </Link>
          </h3>
          <p className="text-sm text-muted-foreground">{opportunity.organization}</p>
        </div>
        <ApplicationStatusBadge status={plan.status} />
      </div>

      <ProgressBar completed={progress.completed} total={progress.total} />

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {dueDate && (
          <Chip size="sm">
            {plan.target_submit_date ? "Your target: " : "Deadline: "}
            {formatShortDate(dueDate)}
          </Chip>
        )}
        {overdueCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 font-medium text-destructive">
            <TriangleAlert aria-hidden="true" className="size-3" />
            {overdueCount} overdue {overdueCount === 1 ? "task" : "tasks"}
          </span>
        )}
      </div>

      {closedOrExpired && (
        <p className="flex items-start gap-1.5 rounded-md border border-dashed border-muted-foreground/40 bg-secondary px-3 py-2 text-xs text-muted-foreground">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          This opportunity is closed or no longer accepting applications.
        </p>
      )}

      <Link
        href={`/applications/${plan.id}`}
        className={cn(
          "mt-1 inline-flex w-fit items-center gap-1 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
        )}
      >
        Continue
        <ArrowRight aria-hidden="true" className="size-3.5" />
      </Link>
    </article>
  );
}

export { ApplicationPlanCard };

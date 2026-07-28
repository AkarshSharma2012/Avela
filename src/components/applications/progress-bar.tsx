import { cn } from "@/lib/utils";

/** A checklist's completion — always paired with the "x of y tasks" text (never color alone) so it reads the same for screen readers and in forced-color modes. */
function ProgressBar({
  completed,
  total,
  className,
}: {
  completed: number;
  total: number;
  className?: string;
}) {
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Checklist progress"
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary"
      >
        <div className="h-full rounded-full bg-primary transition-all duration-[var(--duration-fast)]" style={{ width: `${percent}%` }} />
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        {total === 0 ? "No tasks yet" : `${completed}/${total} tasks`}
      </span>
    </div>
  );
}

export { ProgressBar };

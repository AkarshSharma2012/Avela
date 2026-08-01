import Link from "next/link";
import { Check } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ChecklistItem = {
  key: string;
  label: string;
  detail: string;
  /** 0–100, or null when this row isn't naturally a percent (e.g. "add a reminder"). */
  percent: number | null;
  done: boolean;
  actionLabel: string;
  href: string;
};

/**
 * The dashboard's lower "what to do next" section (spec section 5) — a
 * short, student-friendly checklist, not a dense enterprise table. Replaces
 * the old dashboard's separate Profile/Path/Portfolio/Applications/Saved
 * sections with one place that says what's left and links straight to it.
 */
function ProgressChecklist({ items }: { items: ChecklistItem[] }) {
  return (
    <section aria-labelledby="checklist-heading" className="rounded-lg border border-border bg-card">
      <h2 id="checklist-heading" className="px-5 pt-4 text-xs font-semibold tracking-wide text-primary uppercase">
        Next steps
      </h2>
      <ul className="mt-1 flex flex-col divide-y divide-border">
        {items.map((item) => (
          <li key={item.key} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                  item.done ? "border-success bg-success text-success-foreground" : "border-border text-transparent"
                )}
              >
                <Check className="size-3" strokeWidth={3} />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.detail}</p>
                {item.percent !== null && (
                  <div
                    role="progressbar"
                    aria-valuenow={item.percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${item.label} progress`}
                    className="mt-1.5 h-1.5 w-32 overflow-hidden rounded-full bg-secondary"
                  >
                    <div className="h-full rounded-full bg-primary" style={{ width: `${item.percent}%` }} />
                  </div>
                )}
              </div>
            </div>
            <Link href={item.href} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0 self-start sm:self-auto")}>
              {item.actionLabel}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export { ProgressChecklist };
export type { ChecklistItem };

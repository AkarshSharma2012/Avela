import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** An honest "nothing here yet" placeholder — used wherever real data isn't available yet. */
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; href: string };
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-start gap-3 rounded-md border border-dashed border-border bg-secondary px-6 py-8",
        className
      )}
    >
      {Icon && (
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-full bg-card text-primary"
        >
          <Icon className="size-4" />
        </span>
      )}
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && (
          <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && (
        <Link
          href={action.href}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-1")}
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

export { EmptyState };

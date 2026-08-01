import Link from "next/link";
import { Compass } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Server-clock time-of-day greeting — a small honest touch, not claimed as the student's local time. */
function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * A deliberately short page header (spec section 1) — replaces the old
 * full-viewport serif welcome block. One line of greeting, one line of
 * context, one optional action; never the first thing that pushes real
 * content below the fold.
 */
function DashboardHeader({ firstName }: { firstName: string }) {
  const greeting = greetingForHour(new Date().getHours());

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold tracking-wide text-primary uppercase">Dashboard</p>
        <h1 className="mt-1 font-sans text-2xl font-bold text-foreground">
          {greeting}, {firstName}.
        </h1>
        <p className="mt-1 text-sm text-text-secondary">Here&apos;s what needs your attention today.</p>
      </div>
      <Link href="/opportunities" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        <Compass aria-hidden="true" className="size-3.5" />
        Find opportunities
      </Link>
    </div>
  );
}

export { DashboardHeader };

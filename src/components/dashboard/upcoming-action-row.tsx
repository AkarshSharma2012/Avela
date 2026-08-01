import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const TONE_CLASSES = {
  coral: "bg-coral/12 text-coral",
  gold: "bg-gold/20 text-gold-foreground",
  primary: "bg-primary/12 text-primary",
  muted: "bg-secondary text-muted-foreground",
} as const;

/**
 * One row in the dashboard's compact side panel (spec section 6) — a
 * single real signal (a deadline, a reminder, a saved-items nudge), never
 * a noisy activity feed. Kept generic so the panel can mix reminder rows
 * and deadline rows without two near-duplicate components.
 */
function UpcomingActionRow({
  icon: Icon,
  tone = "muted",
  title,
  detail,
  href,
}: {
  icon: LucideIcon;
  tone?: keyof typeof TONE_CLASSES;
  title: string;
  detail: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
    >
      <span aria-hidden="true" className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", TONE_CLASSES[tone])}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </Link>
  );
}

export { UpcomingActionRow };

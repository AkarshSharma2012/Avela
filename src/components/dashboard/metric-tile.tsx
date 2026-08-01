import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const TONE_CLASSES = {
  success: "bg-success text-success-foreground",
  gold: "bg-gold text-gold-foreground",
  coral: "bg-coral text-coral-foreground",
} as const;

/**
 * One bold flat-color metric block — a real count, never fabricated. Sized
 * via `span` (grid column/row span utilities passed in by the caller) so
 * DashboardOverview can compose the three tiles with deliberately uneven
 * weight instead of three identical SaaS cards.
 */
function MetricTile({
  label,
  value,
  icon: Icon,
  tone,
  secondary,
  href,
  span,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: keyof typeof TONE_CLASSES;
  secondary?: string;
  href: string;
  span?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "hover-lift flex flex-col justify-between gap-3 rounded-lg px-4 py-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        TONE_CLASSES[tone],
        span
      )}
    >
      <Icon aria-hidden="true" className="size-5 opacity-90" />
      <div>
        <p className="font-sans text-3xl leading-none font-bold tabular-nums">{value}</p>
        <p className="mt-1.5 text-xs font-semibold tracking-wide uppercase opacity-90">{label}</p>
        {secondary && <p className="mt-0.5 text-[0.7rem] opacity-80">{secondary}</p>}
      </div>
    </Link>
  );
}

export { MetricTile };

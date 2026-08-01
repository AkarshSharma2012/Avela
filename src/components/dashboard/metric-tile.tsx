import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const TONE_CLASSES = {
  success: { border: "border-l-success", chip: "bg-success/15 text-success" },
  gold: { border: "border-l-gold", chip: "bg-gold/20 text-gold-foreground" },
  coral: { border: "border-l-coral", chip: "bg-coral/15 text-coral" },
} as const;

/**
 * One metric block in the overview row (spec section 2) — a tinted icon
 * chip and a left accent band rather than a full flat-color fill, so three
 * tiles read as comparable weight instead of one dominating block. A real
 * count, never fabricated; at zero it leads with a short, honest message
 * (spec section 3) instead of a bare "0" in a large empty-feeling card.
 */
function MetricTile({
  label,
  value,
  icon: Icon,
  tone,
  secondary,
  emptyTitle,
  emptyBody,
  emptyActionLabel,
  href,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: keyof typeof TONE_CLASSES;
  secondary?: string;
  emptyTitle: string;
  emptyBody: string;
  emptyActionLabel?: string;
  href: string;
}) {
  const toneClasses = TONE_CLASSES[tone];
  const isEmpty = value === 0;

  return (
    <Link
      href={href}
      className={cn(
        "hover-lift flex flex-col gap-2 rounded-lg border border-border border-l-4 bg-card px-4 py-3.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        toneClasses.border
      )}
    >
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", toneClasses.chip)}>
          <Icon className="size-3.5" />
        </span>
        {!isEmpty && <p className="font-sans text-2xl leading-none font-bold tabular-nums text-foreground">{value}</p>}
      </div>

      {isEmpty ? (
        <div>
          <p className="text-xs font-semibold text-foreground">{emptyTitle}</p>
          <p className="mt-0.5 text-[0.7rem] leading-snug text-muted-foreground">
            {emptyBody}
            {emptyActionLabel && <span className="ml-1 font-medium text-primary">{emptyActionLabel} →</span>}
          </p>
        </div>
      ) : (
        <div>
          <p className="text-xs font-semibold text-foreground">{label}</p>
          {secondary && <p className="mt-0.5 text-[0.7rem] text-muted-foreground">{secondary}</p>}
        </div>
      )}
    </Link>
  );
}

export { MetricTile };

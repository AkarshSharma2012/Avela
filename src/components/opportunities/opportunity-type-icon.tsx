import {
  Briefcase,
  GraduationCap,
  HeartHandshake,
  Microscope,
  Sun,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";

import { TYPE_LABELS } from "@/lib/opportunities/constants";
import { cn } from "@/lib/utils";
import type { OpportunityType } from "@/types/database";

/** One icon + accent color per opportunity type — a scannable visual identity across a grid of cards, never the only signal (the type Chip's text label is always shown alongside it). */
const TYPE_STYLE: Record<OpportunityType, { icon: LucideIcon; className: string }> = {
  internship: { icon: Briefcase, className: "bg-primary/12 text-primary" },
  competition: { icon: Trophy, className: "bg-gold/15 text-gold-foreground" },
  volunteer: { icon: HeartHandshake, className: "bg-success/12 text-success" },
  summer_program: { icon: Sun, className: "bg-signal/15 text-signal-foreground" },
  research: { icon: Microscope, className: "bg-insight/12 text-insight" },
  scholarship: { icon: GraduationCap, className: "bg-gold/15 text-gold-foreground" },
  club: { icon: Users, className: "bg-primary/12 text-primary" },
};

function OpportunityTypeIcon({ type, className }: { type: OpportunityType; className?: string }) {
  const { icon: Icon, className: styleClassName } = TYPE_STYLE[type];
  return (
    <span
      role="img"
      aria-label={TYPE_LABELS[type]}
      title={TYPE_LABELS[type]}
      className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", styleClassName, className)}
    >
      <Icon aria-hidden="true" className="size-4" />
    </span>
  );
}

export { OpportunityTypeIcon };

import { BadgeCheck, Ban, CalendarClock, Clock, FlaskConical, History, ShieldQuestion } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import { VERIFICATION_LABEL_TEXT } from "@/lib/opportunities/verification-labels";
import { cn } from "@/lib/utils";
import type { OpportunityVerificationLabel } from "@/types/database";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Seven distinct, evidence-backed states (Milestone 7 spec section 5) —
 * never one generic "Unverified" badge for every situation. `isSample`
 * (development-only demo data) always wins over everything else, exactly
 * as it did in Milestone 4/5 — the two remain mutually exclusive at the
 * database level.
 */
const LABEL_STYLE: Record<OpportunityVerificationLabel, { icon: IconComponent; className: string }> = {
  verified_accepting: {
    icon: BadgeCheck,
    className: "border-success/30 bg-success/10 text-success",
  },
  verified_opening_soon: {
    icon: Clock,
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  verified_next_cycle: {
    icon: CalendarClock,
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  partially_verified_deadline_unclear: {
    icon: ShieldQuestion,
    className: "border-dashed border-muted-foreground/40 bg-secondary text-muted-foreground",
  },
  needs_review: {
    icon: ShieldQuestion,
    className: "border-border bg-muted text-muted-foreground",
  },
  closed: {
    icon: Ban,
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  stale: {
    icon: History,
    className: "border-dashed border-muted-foreground/40 bg-secondary text-muted-foreground",
  },
};

function VerificationBadge({
  isSample,
  verificationLabel,
  className,
}: {
  isSample: boolean;
  verificationLabel: OpportunityVerificationLabel;
  className?: string;
}) {
  if (isSample) {
    return (
      <span
        className={cn(
          "inline-flex w-fit items-center gap-1 rounded-full border border-dashed border-muted-foreground/40 bg-secondary px-2 py-0.5 text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase",
          className
        )}
      >
        <FlaskConical aria-hidden="true" className="size-3" />
        Sample data
      </span>
    );
  }

  const { icon: Icon, className: labelClassName } = LABEL_STYLE[verificationLabel];

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-medium tracking-wide uppercase",
        labelClassName,
        className
      )}
    >
      <Icon aria-hidden="true" className="size-3" />
      {VERIFICATION_LABEL_TEXT[verificationLabel]}
    </span>
  );
}

export { VerificationBadge };

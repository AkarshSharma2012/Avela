import { BadgeCheck, FlaskConical, ShieldQuestion } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Always renders one of three states — never silent — so a card or detail
 * page never implies an opportunity is a confirmed, live listing when it
 * isn't. `is_sample` (development-only demo data) always wins over
 * `is_verified`; the two are mutually exclusive at the database level (see
 * the migration's `opportunities_not_sample_and_verified` check).
 */
function VerificationBadge({
  isSample,
  isVerified,
  className,
}: {
  isSample: boolean;
  isVerified: boolean;
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

  if (isVerified) {
    return (
      <span
        className={cn(
          "inline-flex w-fit items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[0.65rem] font-medium tracking-wide text-success uppercase",
          className
        )}
      >
        <BadgeCheck aria-hidden="true" className="size-3" />
        Verified
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase",
        className
      )}
    >
      <ShieldQuestion aria-hidden="true" className="size-3" />
      Unverified
    </span>
  );
}

export { VerificationBadge };

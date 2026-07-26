import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** A small pill used to display one selected value in a summary list. */
function Chip({
  size = "md",
  className,
  children,
}: {
  size?: "sm" | "md";
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-full border border-border bg-secondary text-foreground",
        size === "md" ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs",
        className
      )}
    >
      {children}
    </span>
  );
}

export { Chip };

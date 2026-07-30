"use client";

import type { ReactNode } from "react";
import { Collapsible } from "@base-ui/react/collapsible";

import { cn } from "@/lib/utils";

/** A plain disclosure for genuinely secondary content (e.g. "Advanced details" on the portfolio item page) — never used for a primary/tested control, which should stay directly visible. Height-animates via the `--collapsible-panel-height` custom property Base UI sets on the panel, matching the `.collapsible-panel` transition in globals.css. */
function CollapsibleSection({
  trigger,
  children,
  defaultOpen = false,
  className,
}: {
  trigger: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <Collapsible.Root defaultOpen={defaultOpen} className={className}>
      <Collapsible.Trigger className="flex w-full items-center justify-between gap-2 rounded-md py-2 text-left text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
        {trigger}
      </Collapsible.Trigger>
      <Collapsible.Panel className={cn("collapsible-panel")}>
        <div className="pt-1 pb-2">{children}</div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

export { CollapsibleSection };

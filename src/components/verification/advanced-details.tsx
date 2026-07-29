import type { ReactNode } from "react";

/**
 * The spec's "See verification details" — everything technical (claim
 * dimensions, public sources, scoring, conflicts, reviewer notes) lives
 * here, collapsed by default, rather than scattered across the main page.
 * A native <details> needs no client JS for the open/close behavior itself.
 */
function AdvancedDetails({ detailsId, children }: { detailsId: string; children: ReactNode }) {
  return (
    <details id={detailsId} className="mt-6 rounded-md border border-border bg-card">
      <summary className="cursor-pointer list-none px-5 py-3.5 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
        See verification details
      </summary>
      <div className="flex flex-col gap-6 border-t border-border px-5 py-4">{children}</div>
    </details>
  );
}

export { AdvancedDetails };

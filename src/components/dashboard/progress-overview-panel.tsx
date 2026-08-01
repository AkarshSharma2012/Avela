import { ProgressRing } from "@/components/dashboard/progress-ring";

type ProgressRow = {
  key: string;
  percent: number;
  label: string;
  sublabel?: string;
  tone: "primary" | "success";
};

/**
 * Profile readiness and application momentum composed as related rows
 * inside one shared surface (spec section 2), rather than two small
 * disconnected cards — reads as one intentional "how you're doing" panel.
 */
function ProgressOverviewPanel({ rows }: { rows: ProgressRow[] }) {
  return (
    <div className="flex h-full flex-col divide-y divide-border rounded-lg border border-border bg-card">
      {rows.map((row) => {
        const clamped = Math.max(0, Math.min(100, Math.round(row.percent)));
        return (
          <div
            key={row.key}
            role="progressbar"
            aria-valuenow={clamped}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={row.label}
            className="flex flex-1 items-center gap-3 px-4 py-3"
          >
            <ProgressRing percent={row.percent} tone={row.tone} className="size-12" />
            <div className="min-w-0">
              <p className="font-sans text-xl leading-none font-bold tabular-nums text-foreground">{clamped}%</p>
              <p className="mt-1 text-xs font-semibold text-foreground">{row.label}</p>
              {row.sublabel && <p className="mt-0.5 text-[0.7rem] leading-snug text-muted-foreground">{row.sublabel}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { ProgressOverviewPanel };
export type { ProgressRow };

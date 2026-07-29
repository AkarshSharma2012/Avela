import { CheckCircle2, Circle } from "lucide-react";

import { cn } from "@/lib/utils";

type ReviewRow = { label: string; done: boolean };

/** Step 3 — a short, plain-language summary of what's been added so far, never the full dimension/scoring model (that lives behind "See verification details"). */
function ReviewStep({ rows }: { rows: ReviewRow[] }) {
  const missing = rows.filter((row) => !row.done);

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2 text-sm">
            {row.done ? (
              <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-success" />
            ) : (
              <Circle aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className={cn(row.done ? "text-foreground" : "text-muted-foreground")}>{row.label}</span>
          </li>
        ))}
      </ul>

      {missing.length === 1 && (
        <p className="rounded-md border border-dashed border-gold/40 bg-gold/10 px-3.5 py-3 text-sm text-foreground">
          Missing one detail: {missing[0]!.label}. You can still continue — this is optional.
        </p>
      )}
      {missing.length === 0 && <p className="text-sm text-success">Nice — you&apos;ve covered everything here.</p>}
    </div>
  );
}

export { ReviewStep };
export type { ReviewRow };

import { Check, X } from "lucide-react";

import { buildResumeSummary, getExpectedFields, type ExpectedField } from "@/lib/portfolio/summary";
import type { PortfolioItem } from "@/types/portfolio";

const FIELD_LABELS: Record<ExpectedField, string> = {
  organization: "Organization",
  role: "Your role",
  dates: "Dates",
  outcome: "Outcome",
  skills: "Skills",
};

/** A factual, always-editable resume preview plus a plain checklist of what's still missing — only lists fields actually relevant to this item's type, and never invents a value for a blank one, just names the gap. */
function CompletenessChecklist({ item }: { item: PortfolioItem }) {
  const { summary, missingFields } = buildResumeSummary(item);
  const expectedFields = getExpectedFields(item.item_type);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Resume-ready summary</p>
        <p className="mt-1.5 rounded-md border border-dashed border-border bg-secondary px-3.5 py-3 text-sm text-foreground">
          {summary}
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Built only from what you&apos;ve entered — edit the fields above to change it.
        </p>
      </div>

      {expectedFields.length > 0 && (
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Completeness checklist</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {expectedFields.map((field) => {
              const missing = missingFields.includes(field);
              return (
                <li key={field} className="flex items-center gap-2 text-sm">
                  {missing ? (
                    <X aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <Check aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
                  )}
                  <span className={missing ? "text-muted-foreground" : "text-foreground"}>{FIELD_LABELS[field]}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export { CompletenessChecklist };

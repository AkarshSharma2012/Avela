import type { ElementType } from "react";
import { CircleDashed, Link2, Paperclip, UserCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import type { SupportMethod } from "@/components/verification/wizard/types";

const CARDS: readonly { value: SupportMethod; title: string; helper: string; icon: ElementType }[] = [
  { value: "connect_account", title: "Connect an account", helper: "Link GitHub so we can check ownership.", icon: Link2 },
  { value: "add_files", title: "Add photos or files", helper: "Upload work you made, plus a few short answers.", icon: Paperclip },
  { value: "add_link", title: "Add a public link", helper: "Point to a page that shows this is real.", icon: Link2 },
  { value: "ask_confirm", title: "Ask someone to confirm", helper: "A teacher, mentor, or organization contact.", icon: UserCheck },
  { value: "later", title: "Do this later", helper: "Skip for now — you can always come back.", icon: CircleDashed },
];

/**
 * Step 1 (spec's DESIRED STRUCTURE): large selectable cards, one method
 * chosen at a time — never a grid of every technical option at once. Native
 * radio semantics via role="radio" on each card keep this keyboard- and
 * screen-reader-navigable without pulling in a whole listbox component.
 */
function MethodSelectStep({ value, onChange }: { value: SupportMethod | null; onChange: (method: SupportMethod) => void }) {
  return (
    <div role="radiogroup" aria-label="Choose a support method" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {CARDS.map((card) => {
        const selected = value === card.value;
        const Icon = card.icon;
        return (
          <button
            key={card.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(card.value)}
            className={cn(
              "flex items-start gap-3 rounded-xl border bg-card px-4 py-4 text-left transition-all duration-[var(--duration-fast)] ease-out",
              "hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
              selected
                ? "border-primary bg-gradient-to-br from-primary/10 via-card to-card shadow-sm"
                : "border-border hover:border-primary/40"
            )}
          >
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full",
                selected ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
              )}
            >
              <Icon aria-hidden="true" className="size-4.5" />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-foreground">{card.title}</span>
              <span className="text-xs text-muted-foreground">{card.helper}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export { MethodSelectStep };

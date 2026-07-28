import type { LucideIcon } from "lucide-react";

import { ReminderCard, type ReminderCardData } from "@/components/reminders/reminder-card";
import { EmptyState } from "@/components/ui/empty-state";

/** One titled section of the Reminder Center (Overdue / Today / This week / Later / Completed or dismissed) — a plain card list, never a dense table (spec section 3). Renders nothing at all when empty and `emptyLabel` isn't given, so an empty "Later" bucket doesn't clutter the page. */
function ReminderSection({
  id,
  title,
  icon: Icon,
  reminders,
  emptyLabel,
}: {
  id: string;
  title: string;
  icon?: LucideIcon;
  reminders: readonly ReminderCardData[];
  emptyLabel?: string;
}) {
  if (reminders.length === 0 && !emptyLabel) return null;

  return (
    <section aria-labelledby={id} className="animate-fade-up mt-8">
      <h2 id={id} className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-primary uppercase">
        {Icon && <Icon aria-hidden="true" className="size-3.5" />}
        {title}
        {reminders.length > 0 && <span className="text-muted-foreground normal-case">({reminders.length})</span>}
      </h2>
      <div className="mt-3">
        {reminders.length === 0 ? (
          <EmptyState title={emptyLabel ?? "Nothing here."} />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {reminders.map((reminder) => (
              <ReminderCard key={reminder.id} reminder={reminder} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export { ReminderSection };

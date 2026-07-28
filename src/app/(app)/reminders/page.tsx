import type { Metadata } from "next";
import { AlarmClock, CalendarCheck2, CalendarClock, CheckCircle2, Clock, TriangleAlert } from "lucide-react";

import { CustomReminderForm } from "@/components/reminders/custom-reminder-form";
import type { ReminderCardData } from "@/components/reminders/reminder-card";
import { ReminderSection } from "@/components/reminders/reminder-section";
import { EmptyState } from "@/components/ui/empty-state";
import { getApplicationPlans } from "@/lib/applications/repository";
import { isOpportunityClosedOrExpired } from "@/lib/applications/opportunity-status";
import { requireProfile } from "@/lib/auth/dal";
import { groupReminders } from "@/lib/reminders/intelligence";
import { listRemindersForUser } from "@/lib/reminders/repository";
import { synchronizeRemindersForUser } from "@/lib/reminders/sync";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Reminders — Avela",
};

export default async function RemindersPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  // Safe and idempotent — reconciles automatic reminders against live
  // plan/task/feedback state on every visit (spec section 2).
  await synchronizeRemindersForUser(supabase, profile.id);

  const [reminders, planBundles] = await Promise.all([
    listRemindersForUser(supabase, profile.id),
    getApplicationPlans(supabase, profile.id),
  ]);

  const planContext = new Map(planBundles.map((bundle) => [bundle.plan.id, bundle]));
  const opportunityTitleById = new Map(planBundles.map((bundle) => [bundle.opportunity.id, bundle.opportunity.title]));

  const missingOpportunityIds = [
    ...new Set(
      reminders
        .map((reminder) => reminder.opportunity_id)
        .filter((id): id is string => id !== null && !opportunityTitleById.has(id))
    ),
  ];
  if (missingOpportunityIds.length > 0) {
    const { data } = await supabase.from("opportunities").select("id, title").in("id", missingOpportunityIds);
    for (const row of data ?? []) opportunityTitleById.set(row.id, row.title);
  }

  const cards: ReminderCardData[] = reminders.map((reminder) => {
    if (reminder.application_plan_id) {
      const bundle = planContext.get(reminder.application_plan_id);
      return {
        ...reminder,
        relatedHref: `/applications/${reminder.application_plan_id}`,
        relatedLabel: bundle ? bundle.opportunity.title : null,
      };
    }
    if (reminder.opportunity_id) {
      return {
        ...reminder,
        relatedHref: `/opportunities/${reminder.opportunity_id}`,
        relatedLabel: opportunityTitleById.get(reminder.opportunity_id) ?? null,
      };
    }
    return { ...reminder, relatedHref: null, relatedLabel: null };
  });

  const groups = groupReminders(cards);
  const hasAnyActive =
    groups.overdue.length > 0 || groups.today.length > 0 || groups.thisWeek.length > 0 || groups.later.length > 0;

  const warnings = planBundles.filter(
    (bundle) => isOpportunityClosedOrExpired(bundle.opportunity) && bundle.plan.status !== "withdrawn"
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-6 py-10 sm:py-12">
      <div className="stagger-children">
        <p className="animate-fade-up mb-3 text-xs font-medium tracking-wide text-primary uppercase">Reminders</p>
        <h1 className="animate-fade-up font-heading text-3xl text-foreground sm:text-4xl">
          Deadline &amp; Reminder Center
        </h1>
        <p className="animate-fade-up mt-3 max-w-lg text-base leading-relaxed text-text-secondary">
          Everything due soon, everything overdue, and everything you asked us to remind you about — all in one
          place.
        </p>
      </div>

      <div className="animate-fade-up mt-6">
        <CustomReminderForm />
      </div>

      {warnings.length > 0 && (
        <section aria-labelledby="warnings-heading" className="animate-fade-up mt-8">
          <h2
            id="warnings-heading"
            className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-destructive uppercase"
          >
            <TriangleAlert aria-hidden="true" className="size-3.5" />
            Heads up
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {warnings.map((bundle) => (
              <li
                key={bundle.plan.id}
                className="rounded-md border border-dashed border-muted-foreground/40 bg-secondary px-4 py-3 text-sm text-muted-foreground"
              >
                <strong className="text-foreground">{bundle.opportunity.title}</strong> is closed or no longer
                accepting applications — no new deadline reminders will be created for it.
              </li>
            ))}
          </ul>
        </section>
      )}

      <ReminderSection id="overdue-heading" title="Overdue" icon={TriangleAlert} reminders={groups.overdue} />
      <ReminderSection id="today-heading" title="Today" icon={AlarmClock} reminders={groups.today} />
      <ReminderSection id="week-heading" title="This week" icon={CalendarClock} reminders={groups.thisWeek} />
      <ReminderSection id="later-heading" title="Later" icon={Clock} reminders={groups.later} />

      {!hasAnyActive && (
        <div className="animate-fade-up mt-8">
          <EmptyState
            icon={CalendarCheck2}
            title="You're all caught up."
            description="Nothing due right now — reminders will show up here as deadlines approach."
          />
        </div>
      )}

      <ReminderSection id="done-heading" title="Completed or dismissed" icon={CheckCircle2} reminders={groups.done} />
    </div>
  );
}

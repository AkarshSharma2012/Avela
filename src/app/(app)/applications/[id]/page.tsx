import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft, ExternalLink, TriangleAlert } from "lucide-react";

import { ApplicationStatusBadge } from "@/components/applications/application-status-badge";
import { NotesEditor } from "@/components/applications/notes-editor";
import { StatusSelect } from "@/components/applications/status-select";
import { TargetDateInput } from "@/components/applications/target-date-input";
import { TaskChecklist } from "@/components/applications/task-checklist";
import { SaveButton } from "@/components/opportunities/save-button";
import { CustomReminderForm } from "@/components/reminders/custom-reminder-form";
import { ReminderCard, type ReminderCardData } from "@/components/reminders/reminder-card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getApplicationPlanBundle } from "@/lib/applications/repository";
import { isOpportunityClosedOrExpired } from "@/lib/applications/opportunity-status";
import { getAuthenticatedUser, requireProfile } from "@/lib/auth/dal";
import { TYPE_LABELS } from "@/lib/opportunities/constants";
import { formatShortDate } from "@/lib/opportunities/format";
import { isOpportunitySaved } from "@/lib/opportunities/query";
import { listRemindersForPlan } from "@/lib/reminders/repository";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type PageParams = { id: string };

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<Metadata> {
  const { id } = await params;
  const user = await getAuthenticatedUser();
  if (!user) return { title: "My Application — Avela" };

  const supabase = await createClient();
  const bundle = await getApplicationPlanBundle(supabase, user.id, id);
  return { title: bundle ? `${bundle.opportunity.title} — My Application — Avela` : "My Application — Avela" };
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="animate-fade-up mt-8">
      <h2 id={id} className="text-xs font-medium tracking-wide text-primary uppercase">
        {title}
      </h2>
      <div className="mt-3 rounded-md border border-border bg-card px-5 py-4">{children}</div>
    </section>
  );
}

export default async function ApplicationWorkspacePage({ params }: { params: Promise<PageParams> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const bundle = await getApplicationPlanBundle(supabase, profile.id, id);
  if (!bundle) {
    notFound();
  }

  const { plan, opportunity, tasks } = bundle;
  const [saved, planReminders] = await Promise.all([
    isOpportunitySaved(supabase, profile.id, opportunity.id),
    listRemindersForPlan(supabase, profile.id, plan.id),
  ]);
  const closedOrExpired = isOpportunityClosedOrExpired(opportunity);
  const reminderCards: ReminderCardData[] = planReminders.map((reminder) => ({ ...reminder, relatedHref: null, relatedLabel: null }));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-6 py-10 sm:py-12">
      <Link
        href="/applications"
        className="animate-fade-up inline-flex w-fit items-center gap-1.5 rounded-sm text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        <ArrowLeft aria-hidden="true" className="size-3.5" />
        Back to My Applications
      </Link>

      <div className="stagger-children mt-6">
        <div className="animate-fade-up flex items-start justify-between gap-3">
          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-primary uppercase">
              {TYPE_LABELS[opportunity.opportunity_type]}
            </p>
            <h1 className="font-heading text-3xl text-foreground sm:text-4xl">{opportunity.title}</h1>
            <p className="mt-1 text-base text-muted-foreground">{opportunity.organization}</p>
          </div>
          <ApplicationStatusBadge status={plan.status} />
        </div>

        {closedOrExpired && (
          <p className="animate-fade-up mt-4 flex items-start gap-1.5 rounded-md border border-dashed border-muted-foreground/40 bg-secondary px-4 py-3 text-sm text-muted-foreground">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            This opportunity is closed or no longer accepting applications — you can still keep your notes and tasks
            here.
          </p>
        )}

        <div className="animate-fade-up mt-6 flex flex-wrap items-center gap-3">
          <a
            href={opportunity.application_url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
          >
            View original listing
            <ExternalLink aria-hidden="true" className="size-3.5" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <SaveButton opportunityId={opportunity.id} initiallySaved={saved} />
        </div>

        <Section id="timeline-heading" title="Timeline">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Official deadline</dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {plan.official_deadline ? formatShortDate(plan.official_deadline) : "Not confirmed yet"}
              </dd>
            </div>
          </dl>
          <div className="mt-4">
            <TargetDateInput planId={plan.id} initialDate={plan.target_submit_date} />
          </div>
        </Section>

        <Section id="status-heading" title="Status">
          <StatusSelect planId={plan.id} initialStatus={plan.status} />
        </Section>

        <Section id="notes-heading" title="Notes">
          <NotesEditor planId={plan.id} initialNotes={plan.notes} />
        </Section>

        <Section id="checklist-heading" title="Checklist">
          <TaskChecklist planId={plan.id} initialTasks={tasks} />
        </Section>

        <Section id="reminders-heading" title="Reminders">
          <div className="flex flex-col gap-3">
            {reminderCards.length === 0 ? (
              <EmptyState title="No reminders yet." description="Add one below, or set a target date and due dates above to get automatic ones." />
            ) : (
              <ul className="flex flex-col gap-2.5">
                {reminderCards.map((reminder) => (
                  <ReminderCard key={reminder.id} reminder={reminder} compact />
                ))}
              </ul>
            )}
            <CustomReminderForm applicationPlanId={plan.id} opportunityId={opportunity.id} />
          </div>
        </Section>
      </div>
    </div>
  );
}

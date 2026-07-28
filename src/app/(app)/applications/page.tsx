import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";

import { ApplicationPlanCard } from "@/components/applications/application-plan-card";
import { EmptyState } from "@/components/ui/empty-state";
import { APPLICATION_STATUSES, isActiveApplicationStatus, isDoneApplicationStatus } from "@/lib/applications/constants";
import { getApplicationPlans, type ApplicationPlanBundle } from "@/lib/applications/repository";
import { planDueDate, planNeedsAttention } from "@/lib/applications/summary";
import { requireProfile } from "@/lib/auth/dal";
import { formatShortDate } from "@/lib/opportunities/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "My Applications — Avela",
};

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="text-xs font-medium tracking-wide text-primary uppercase">
      {children}
    </h2>
  );
}

export default async function ApplicationsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const bundles = await getApplicationPlans(supabase, profile.id);

  if (bundles.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col px-6 py-10 sm:py-12">
        <PageHeader />
        <div className="animate-fade-up mt-8">
          <EmptyState
            icon={ClipboardList}
            title="No applications yet."
            description={'Save an opportunity and choose "Help me apply" to start tracking it here.'}
            action={{ label: "Browse Opportunities", href: "/opportunities" }}
          />
        </div>
      </div>
    );
  }

  const now = new Date();
  const active = bundles.filter((bundle) => isActiveApplicationStatus(bundle.plan.status));
  const done = bundles.filter((bundle) => isDoneApplicationStatus(bundle.plan.status));

  const attentionBundles = active.filter((bundle) => planNeedsAttention(bundle, now) !== null);

  const upcoming = active
    .map((bundle) => ({ bundle, date: planDueDate(bundle.plan) }))
    .filter((entry): entry is { bundle: ApplicationPlanBundle; date: string } => entry.date !== null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5);

  const statusCounts = new Map<string, number>();
  for (const bundle of bundles) {
    statusCounts.set(bundle.plan.status, (statusCounts.get(bundle.plan.status) ?? 0) + 1);
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col px-6 py-10 sm:py-12">
      <PageHeader />

      {attentionBundles.length > 0 && (
        <section aria-labelledby="attention-heading" className="animate-fade-up mt-8">
          <SectionHeading id="attention-heading">Needs your attention</SectionHeading>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {attentionBundles.map((bundle) => (
              <ApplicationPlanCard key={bundle.plan.id} bundle={bundle} now={now} />
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section aria-labelledby="deadlines-heading" className="animate-fade-up mt-8">
          <SectionHeading id="deadlines-heading">Upcoming deadlines</SectionHeading>
          <ul className="mt-4 flex flex-col gap-2">
            {upcoming.map(({ bundle, date }) => (
              <li
                key={bundle.plan.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/applications/${bundle.plan.id}`}
                    className="block truncate rounded-sm text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                  >
                    {bundle.opportunity.title}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">{bundle.opportunity.organization}</p>
                </div>
                <span className="shrink-0 text-xs font-medium text-muted-foreground">{formatShortDate(date)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="progress-heading" className="animate-fade-up mt-8">
        <SectionHeading id="progress-heading">Progress by status</SectionHeading>
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Application counts by status">
          {APPLICATION_STATUSES.filter((option) => (statusCounts.get(option.value) ?? 0) > 0).map((option) => (
            <li
              key={option.value}
              className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-foreground"
            >
              {option.label}: {statusCounts.get(option.value)}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="active-heading" className="animate-fade-up mt-8">
        <SectionHeading id="active-heading">Active applications</SectionHeading>
        {active.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Nothing in progress right now.</p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {active.map((bundle) => (
              <ApplicationPlanCard key={bundle.plan.id} bundle={bundle} now={now} />
            ))}
          </div>
        )}
      </section>

      {done.length > 0 && (
        <section aria-labelledby="done-heading" className="animate-fade-up mt-8">
          <SectionHeading id="done-heading">Completed &amp; submitted</SectionHeading>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {done.map((bundle) => (
              <ApplicationPlanCard key={bundle.plan.id} bundle={bundle} now={now} />
            ))}
          </div>
        </section>
      )}

      <p className="animate-fade-up mt-8 text-sm text-muted-foreground">
        Looking for something new to apply to? Browse{" "}
        <Link href="/opportunities" className="text-primary underline-offset-4 hover:underline">
          Opportunities
        </Link>
        .
      </p>
    </div>
  );
}

function PageHeader() {
  return (
    <div className="stagger-children">
      <p className="animate-fade-up mb-3 text-xs font-medium tracking-wide text-primary uppercase">Applications</p>
      <h1 className="animate-fade-up font-heading text-3xl text-foreground sm:text-4xl">Your applications.</h1>
      <p className="animate-fade-up mt-3 max-w-lg text-base leading-relaxed text-text-secondary">
        Everything you&apos;re working on, tracked in one place — deadlines, tasks, and where each one stands.
      </p>
    </div>
  );
}

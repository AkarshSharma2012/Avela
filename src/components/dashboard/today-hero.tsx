import Link from "next/link";
import { ArrowRight, CalendarClock, Compass, ListChecks, Sparkles } from "lucide-react";

import { MatchSignal } from "@/components/ui/discovery-pulse";
import { buttonVariants } from "@/components/ui/button";
import type { ChosenForYouEntry } from "@/lib/opportunities/chosen-for-you";
import { formatShortDate } from "@/lib/opportunities/format";
import { TYPE_LABELS } from "@/lib/opportunities/constants";
import { cn } from "@/lib/utils";

type TodayAction = { title: string; description: string; href: string; cta: string };

/**
 * The dashboard's single "what matters today" zone — one recommended
 * action, picked by real urgency (never fabricated), plus three honest
 * stat chips. Everything below this on the page still exists (reminders,
 * applications, portfolio, chosen-for-you all keep their own sections),
 * this is deliberately the one thing a student sees first, not a
 * replacement for the detail underneath.
 */
function buildTodayAction(input: {
  overdueTaskCount: number;
  nearestDeadline: { planId: string; opportunityTitle: string; date: string } | null;
  overdueReminderCount: number;
  nextReminder: { title: string; remindAt: string } | null;
  nextReminderHref: string;
  featured: ChosenForYouEntry | null;
}): TodayAction {
  if (input.overdueTaskCount > 0 && input.nearestDeadline) {
    return {
      title: `${input.overdueTaskCount} overdue ${input.overdueTaskCount === 1 ? "task" : "tasks"} on ${input.nearestDeadline.opportunityTitle}`,
      description: "Catching up now keeps this application on track.",
      href: `/applications/${input.nearestDeadline.planId}`,
      cta: "Review tasks",
    };
  }
  if (input.overdueReminderCount > 0) {
    return {
      title: `${input.overdueReminderCount} overdue ${input.overdueReminderCount === 1 ? "reminder" : "reminders"}`,
      description: "A few things need your attention.",
      href: input.nextReminderHref,
      cta: "View reminders",
    };
  }
  if (input.nearestDeadline) {
    return {
      title: `${input.nearestDeadline.opportunityTitle} is due ${formatShortDate(input.nearestDeadline.date)}`,
      description: "Your next application deadline.",
      href: `/applications/${input.nearestDeadline.planId}`,
      cta: "Continue application",
    };
  }
  if (input.featured) {
    const label = TYPE_LABELS[input.featured.opportunity.opportunity_type];
    return {
      title: input.featured.opportunity.title,
      description: `Your strongest match today — a ${label.toLowerCase()} from ${input.featured.opportunity.organization}.`,
      href: `/opportunities/${input.featured.opportunity.id}`,
      cta: "View match",
    };
  }
  if (input.nextReminder) {
    return {
      title: input.nextReminder.title,
      description: "Coming up next.",
      href: input.nextReminderHref,
      cta: "View reminders",
    };
  }
  return {
    title: "Let's find your first match.",
    description: "Search trusted sources for opportunities that fit your profile.",
    href: "/opportunities",
    cta: "Browse opportunities",
  };
}

function TodayHero({
  firstName,
  overdueTaskCount,
  nearestDeadline,
  overdueReminderCount,
  nextReminder,
  nextReminderHref,
  featured,
  strongMatchCount,
  profileStrengthPercent,
}: {
  firstName: string;
  overdueTaskCount: number;
  nearestDeadline: { planId: string; opportunityTitle: string; date: string } | null;
  overdueReminderCount: number;
  nextReminder: { title: string; remindAt: string } | null;
  nextReminderHref: string;
  featured: ChosenForYouEntry | null;
  strongMatchCount: number;
  profileStrengthPercent: number;
}) {
  const action = buildTodayAction({
    overdueTaskCount,
    nearestDeadline,
    overdueReminderCount,
    nextReminder,
    nextReminderHref,
    featured,
  });

  return (
    <section
      aria-labelledby="today-heading"
      className="animate-fade-up relative mt-8 overflow-hidden rounded-2xl border border-primary/20 bg-card px-6 py-7 shadow-[var(--shadow-glow)] sm:px-8 sm:py-8"
    >
      {/* Ambient Discovery Pulse wash — ties the hero to the same signature motif as the Find More loading state, but purely decorative and very low-opacity here. */}
      <div className="animate-gradient-pan gradient-signal pointer-events-none absolute inset-0 opacity-[0.06]" aria-hidden="true" />
      <div className="animate-pulse-ring-slow pointer-events-none absolute -top-16 -right-16 size-56 rounded-full bg-signal/20 blur-2xl" aria-hidden="true" />

      <div className="relative">
        <p id="today-heading" className="text-xs font-medium tracking-wide text-primary uppercase">
          Today
        </p>
        <h2 className="mt-2 font-heading text-2xl text-foreground sm:text-3xl">{action.title}</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-text-secondary">{action.description}</p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link href={action.href} className={cn(buttonVariants({ variant: "default", size: "lg" }))}>
            {action.cta}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
          <span className="text-sm text-muted-foreground">Hi {firstName} — here&apos;s what matters most right now.</span>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {strongMatchCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles aria-hidden="true" className="size-3.5" />
              {strongMatchCount} strong {strongMatchCount === 1 ? "match" : "matches"}
              <MatchSignal tier="strong_fit" />
            </span>
          )}
          {nearestDeadline && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-coral/30 bg-coral/10 px-3 py-1 text-xs font-medium text-coral">
              <CalendarClock aria-hidden="true" className="size-3.5" />
              Next deadline {formatShortDate(nearestDeadline.date)}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-medium text-gold-foreground">
            <ListChecks aria-hidden="true" className="size-3.5" />
            Portfolio {profileStrengthPercent}% complete
          </span>
          {strongMatchCount === 0 && !nearestDeadline && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-signal/30 bg-signal/10 px-3 py-1 text-xs font-medium text-signal-foreground">
              <Compass aria-hidden="true" className="size-3.5" />
              Keep exploring — more opportunities are verified regularly
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

export { TodayHero };

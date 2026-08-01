import Link from "next/link";
import { AlertTriangle, ArrowRight, Bell, CalendarClock, Compass, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import type { ChosenForYouEntry } from "@/lib/opportunities/chosen-for-you";
import { formatShortDate } from "@/lib/opportunities/format";
import { TYPE_LABELS } from "@/lib/opportunities/constants";
import { cn } from "@/lib/utils";

type PriorityTone = "coral" | "gold" | "success" | "signal" | "primary";

type PriorityAction = {
  title: string;
  description: string;
  href: string;
  cta: string;
  icon: LucideIcon;
  tone: PriorityTone;
  status: string;
  /** A short due-date/progress cue shown as a small pill (spec section 4) — omitted when there's nothing concrete to show. */
  meta?: string;
};

const TONE_CLASSES: Record<PriorityTone, { border: string; wash: string; icon: string; status: string; pill: string }> = {
  coral: {
    border: "border-l-coral",
    wash: "bg-[color-mix(in_oklch,var(--coral),var(--background)_94%)]",
    icon: "bg-coral text-coral-foreground",
    status: "text-coral",
    pill: "bg-coral/15 text-coral",
  },
  gold: {
    border: "border-l-gold",
    wash: "bg-[color-mix(in_oklch,var(--gold),var(--background)_92%)]",
    icon: "bg-gold text-gold-foreground",
    status: "text-gold-foreground",
    pill: "bg-gold/20 text-gold-foreground",
  },
  success: {
    border: "border-l-success",
    wash: "bg-[color-mix(in_oklch,var(--success),var(--background)_94%)]",
    icon: "bg-success text-success-foreground",
    status: "text-success",
    pill: "bg-success/15 text-success",
  },
  signal: {
    border: "border-l-signal",
    wash: "bg-[color-mix(in_oklch,var(--signal),var(--background)_92%)]",
    icon: "bg-signal text-signal-foreground",
    status: "text-signal-foreground",
    pill: "bg-signal/15 text-signal-foreground",
  },
  primary: {
    border: "border-l-primary",
    wash: "bg-[color-mix(in_oklch,var(--primary),var(--background)_94%)]",
    icon: "bg-primary text-primary-foreground",
    status: "text-primary",
    pill: "bg-primary/12 text-primary",
  },
};

function daysUntil(dateStr: string, now: Date): number {
  return Math.floor((new Date(dateStr).getTime() - now.getTime()) / 86_400_000);
}

function dueInLabel(dateStr: string, now: Date): string {
  const days = daysUntil(dateStr, now);
  if (days < 0) return "Overdue";
  if (days === 0) return "Due today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

/**
 * Picks the single most urgent, real thing a student should do next — same
 * priority order the old TodayHero used (overdue tasks > overdue reminders
 * > nearest deadline > featured match > next reminder > cold start), never
 * fabricated. Kept in this file since PriorityAction is now the only
 * consumer.
 */
function buildPriorityAction(
  input: {
    overdueTaskCount: number;
    nearestDeadline: { planId: string; opportunityTitle: string; date: string } | null;
    overdueReminderCount: number;
    nextReminder: { title: string; remindAt: string } | null;
    nextReminderHref: string;
    featured: ChosenForYouEntry | null;
  },
  now: Date = new Date()
): PriorityAction {
  if (input.overdueTaskCount > 0 && input.nearestDeadline) {
    return {
      title: `${input.overdueTaskCount} overdue ${input.overdueTaskCount === 1 ? "task" : "tasks"} on ${input.nearestDeadline.opportunityTitle}`,
      description: "Catching up now keeps this application on track.",
      href: `/applications/${input.nearestDeadline.planId}`,
      cta: "Review tasks",
      icon: AlertTriangle,
      tone: "coral",
      status: "Needs attention",
      meta: dueInLabel(input.nearestDeadline.date, now),
    };
  }
  if (input.overdueReminderCount > 0) {
    return {
      title: `${input.overdueReminderCount} overdue ${input.overdueReminderCount === 1 ? "reminder" : "reminders"}`,
      description: "A few things need your attention.",
      href: input.nextReminderHref,
      cta: "View reminders",
      icon: Bell,
      tone: "coral",
      status: "Needs attention",
    };
  }
  if (input.nearestDeadline) {
    return {
      title: `${input.nearestDeadline.opportunityTitle} is due ${formatShortDate(input.nearestDeadline.date)}`,
      description: "Your next application deadline.",
      href: `/applications/${input.nearestDeadline.planId}`,
      cta: "Continue application",
      icon: CalendarClock,
      tone: "gold",
      status: "Upcoming deadline",
      meta: dueInLabel(input.nearestDeadline.date, now),
    };
  }
  if (input.featured) {
    const label = TYPE_LABELS[input.featured.opportunity.opportunity_type];
    const isStrongFit = input.featured.matchResult.tier === "strong_fit";
    return {
      title: input.featured.opportunity.title,
      description: `Your top match today — a ${label.toLowerCase()} from ${input.featured.opportunity.organization}.`,
      href: `/opportunities/${input.featured.opportunity.id}`,
      cta: "View match",
      icon: Sparkles,
      tone: isStrongFit ? "success" : "primary",
      status: isStrongFit ? "Strong match" : "Top match",
    };
  }
  if (input.nextReminder) {
    return {
      title: input.nextReminder.title,
      description: "Coming up next.",
      href: input.nextReminderHref,
      cta: "View reminders",
      icon: Bell,
      tone: "signal",
      status: "Coming up",
    };
  }
  return {
    title: "Let's find your first match.",
    description: "Search trusted sources for opportunities that fit your profile.",
    href: "/opportunities",
    cta: "Browse opportunities",
    icon: Compass,
    tone: "signal",
    status: "Get started",
  };
}

/**
 * The dashboard's single next-action panel (spec section 4) — a compact,
 * composed card (not a full-viewport gradient hero, and no longer a
 * full-width flat banner: it's now paired with the "Up next" panel beside
 * it, so it only needs to be as wide as its own content). Everything shown
 * is one of the real signals already computed for the page.
 */
function PriorityActionPanel(props: {
  overdueTaskCount: number;
  nearestDeadline: { planId: string; opportunityTitle: string; date: string } | null;
  overdueReminderCount: number;
  nextReminder: { title: string; remindAt: string } | null;
  nextReminderHref: string;
  featured: ChosenForYouEntry | null;
}) {
  const action = buildPriorityAction(props);
  const tone = TONE_CLASSES[action.tone];
  const Icon = action.icon;

  return (
    <section
      aria-labelledby="priority-heading"
      className={cn("flex h-full flex-col gap-4 rounded-lg border-l-4 border-border px-5 py-4", tone.border, tone.wash)}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", tone.icon)}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p id="priority-heading" className={cn("text-xs font-semibold tracking-wide", tone.status)}>
              {action.status}
            </p>
            {action.meta && <span className={cn("rounded-full px-2 py-0.5 text-[0.65rem] font-semibold", tone.pill)}>{action.meta}</span>}
          </div>
          <h2 className="mt-1 font-sans text-lg leading-snug font-semibold text-foreground">{action.title}</h2>
          <p className="mt-1 text-sm text-text-secondary">{action.description}</p>
        </div>
      </div>

      <Link href={action.href} className={cn(buttonVariants({ variant: "default", size: "default" }), "self-start")}>
        {action.cta}
        <ArrowRight aria-hidden="true" className="size-3.5" />
      </Link>
    </section>
  );
}

export { PriorityActionPanel };

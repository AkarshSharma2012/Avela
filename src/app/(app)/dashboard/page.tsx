import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Bell, Bookmark, CalendarClock, Compass } from "lucide-react";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { PriorityActionPanel } from "@/components/dashboard/priority-action";
import { ProgressChecklist, type ChecklistItem } from "@/components/dashboard/progress-checklist";
import { RecommendedOpportunityRow } from "@/components/dashboard/recommended-opportunity-row";
import { UpcomingActionRow } from "@/components/dashboard/upcoming-action-row";
import { DiscoverMore } from "@/components/opportunities/discover-more";
import { FindMoreButton } from "@/components/opportunities/find-more-button";
import { EmptyState } from "@/components/ui/empty-state";
import { isActiveApplicationStatus } from "@/lib/applications/constants";
import { getCachedApplicationPlans } from "@/lib/applications/dal";
import { buildDashboardApplicationSummary, computePlanProgress } from "@/lib/applications/summary";
import { requireProfile } from "@/lib/auth/dal";
import { getOnboardingSummary } from "@/lib/onboarding/dal";
import {
  EXPERIENCE_LEVEL_OPTIONS,
  WEEKLY_AVAILABILITY_OPTIONS,
} from "@/lib/onboarding/constants";
import { buildPortfolioDashboardSummary } from "@/lib/portfolio/dashboard";
import { countEvidenceLinksByPlan, listLinkedItemIdsForUser } from "@/lib/portfolio/evidence-repository";
import { listAllFilesForUser, listPortfolioItems } from "@/lib/portfolio/repository";
import { listVerificationsForUser } from "@/lib/verification/repository";
import { buildReminderDashboardSummary } from "@/lib/reminders/intelligence";
import { formatReminderDateTime } from "@/lib/reminders/format";
import { listRemindersForUser } from "@/lib/reminders/repository";
import { synchronizeRemindersForUser } from "@/lib/reminders/sync";
import { buildChosenForYou } from "@/lib/opportunities/chosen-for-you";
import {
  getDismissedOpportunityIds,
  getFeedbackProfileForUser,
} from "@/lib/opportunities/feedback-repository";
import { buildMatchProfileInput } from "@/lib/opportunities/matching";
import { getSavedOpportunityIds, listOpportunitiesForMatching } from "@/lib/opportunities/query";
import { formatShortDate } from "@/lib/opportunities/format";
import { getFirstName } from "@/lib/profile/display";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Dashboard — Avela",
};

/** Malformed/negative/missing `?shown=` degrades to the first page rather than throwing — same "bad URL never 500s" rule `parseOpportunityFilters` follows. */
function parseShown(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireProfile();
  const firstName = getFirstName(profile);
  const onboardingSummary = await getOnboardingSummary(profile.id);
  const { interests } = onboardingSummary;

  const weeklyAvailabilityLabel = WEEKLY_AVAILABILITY_OPTIONS.find(
    (option) => option.value === profile.weekly_availability
  )?.label;
  const experienceLevelLabel = EXPERIENCE_LEVEL_OPTIONS.find(
    (option) => option.value === profile.experience_level
  )?.label;
  const locationLabel = [profile.city, profile.state].filter(Boolean).join(", ") || null;

  const shown = parseShown((await searchParams).shown);
  const supabase = await createClient();
  const [{ data: candidatePool, error: poolError }, savedIds, feedbackProfile, dismissedOpportunityIds, applicationBundles] =
    await Promise.all([
      listOpportunitiesForMatching(supabase, profile.grade_level, { studentState: profile.state }),
      getSavedOpportunityIds(supabase, profile.id),
      getFeedbackProfileForUser(supabase, profile.id),
      getDismissedOpportunityIds(supabase, profile.id),
      getCachedApplicationPlans(profile.id),
      synchronizeRemindersForUser(supabase, profile.id),
    ]);
  const reminders = await listRemindersForUser(supabase, profile.id);

  const applicationSummary = buildDashboardApplicationSummary(
    applicationBundles.map((bundle) => ({
      planId: bundle.plan.id,
      status: bundle.plan.status,
      targetSubmitDate: bundle.plan.target_submit_date,
      officialDeadline: bundle.plan.official_deadline,
      opportunityTitle: bundle.opportunity.title,
      tasks: bundle.tasks,
    }))
  );

  const activeBundles = applicationBundles.filter((bundle) => isActiveApplicationStatus(bundle.plan.status));
  const activeTaskTotals = activeBundles.reduce(
    (totals, bundle) => {
      const progress = computePlanProgress(bundle.tasks);
      return { completed: totals.completed + progress.completed, total: totals.total + progress.total };
    },
    { completed: 0, total: 0 }
  );
  const applicationMomentumPercent =
    activeTaskTotals.total > 0 ? Math.round((activeTaskTotals.completed / activeTaskTotals.total) * 100) : 0;

  const [portfolioItems, portfolioFiles, linkedPortfolioItemIds, portfolioVerifications] = await Promise.all([
    listPortfolioItems(supabase, profile.id),
    listAllFilesForUser(supabase, profile.id),
    listLinkedItemIdsForUser(supabase, profile.id),
    listVerificationsForUser(supabase, profile.id),
  ]);
  const verificationLevelByItemId = new Map([...portfolioVerifications].map(([itemId, v]) => [itemId, v.verification_level]));
  const activePlanIds = activeBundles.map((bundle) => bundle.plan.id);
  const evidenceCountByPlanId = await countEvidenceLinksByPlan(supabase, profile.id, activePlanIds);
  const fileCountByPortfolioItemId = new Map<string, number>();
  for (const file of portfolioFiles) {
    if (!file.portfolio_item_id) continue;
    fileCountByPortfolioItemId.set(file.portfolio_item_id, (fileCountByPortfolioItemId.get(file.portfolio_item_id) ?? 0) + 1);
  }
  const visiblePortfolioItems = portfolioItems.filter((item) => item.visibility === "visible");
  const portfolioSummary = buildPortfolioDashboardSummary({
    items: visiblePortfolioItems,
    fileCountByItemId: fileCountByPortfolioItemId,
    linkedItemIds: linkedPortfolioItemIds,
    verificationLevelByItemId,
    activePlanIds,
    evidenceCountByPlanId,
  });

  const reminderSummary = buildReminderDashboardSummary(reminders);
  const nextReminderPlan = reminderSummary.next?.application_plan_id
    ? applicationBundles.find((bundle) => bundle.plan.id === reminderSummary.next?.application_plan_id)
    : undefined;
  const nextReminderHref = reminderSummary.next
    ? nextReminderPlan
      ? `/applications/${nextReminderPlan.plan.id}`
      : reminderSummary.next.opportunity_id
        ? `/opportunities/${reminderSummary.next.opportunity_id}`
        : "/reminders"
    : "/reminders";

  const matchProfileInput = buildMatchProfileInput(profile, onboardingSummary);
  const chosenForYou = buildChosenForYou(candidatePool, matchProfileInput, shown, {
    feedbackProfile,
    dismissedOpportunityIds,
  });

  const allChosenEntries = chosenForYou.featured
    ? [chosenForYou.featured, ...chosenForYou.additional]
    : chosenForYou.additional;
  const strongMatchCount = allChosenEntries.filter((entry) => entry.matchResult.tier === "strong_fit").length;
  const profileStrengthPercent =
    portfolioSummary.profileStrength.maxScore > 0
      ? Math.round((portfolioSummary.profileStrength.score / portfolioSummary.profileStrength.maxScore) * 100)
      : 0;

  // Checklist: profile completeness
  const profileFieldsSet = [profile.grade_level, profile.weekly_availability, profile.experience_level, locationLabel].filter(
    Boolean
  ).length;
  const profileFieldsTotal = 4;
  const profileComplete = profileFieldsSet === profileFieldsTotal;

  // Checklist: portfolio proof
  const portfolioDoneCount = visiblePortfolioItems.length - portfolioSummary.incompleteItemCount;

  const checklistItems: ChecklistItem[] = [
    {
      key: "profile",
      label: "Complete your profile",
      detail: profileComplete
        ? [profile.grade_level ? `Grade ${profile.grade_level}` : null, locationLabel, weeklyAvailabilityLabel, experienceLevelLabel]
            .filter(Boolean)
            .join(" · ")
        : `${profileFieldsSet} of ${profileFieldsTotal} details set`,
      percent: Math.round((profileFieldsSet / profileFieldsTotal) * 100),
      done: profileComplete,
      actionLabel: "Edit profile",
      href: "/profile",
    },
    {
      key: "portfolio",
      label: "Add portfolio proof",
      detail:
        visiblePortfolioItems.length === 0
          ? "No portfolio items yet"
          : portfolioSummary.incompleteItemCount > 0
            ? `${portfolioSummary.incompleteItemCount} of ${visiblePortfolioItems.length} items need details`
            : "All items have details",
      percent: visiblePortfolioItems.length === 0 ? 0 : Math.round((portfolioDoneCount / visiblePortfolioItems.length) * 100),
      done: visiblePortfolioItems.length > 0 && portfolioSummary.incompleteItemCount === 0,
      actionLabel: visiblePortfolioItems.length === 0 ? "Add item" : "Review portfolio",
      href: "/portfolio",
    },
    {
      key: "applications",
      label: "Finish your application",
      detail:
        applicationSummary.activeCount === 0
          ? "No active applications yet"
          : applicationSummary.overdueTaskCount > 0
            ? `${applicationSummary.overdueTaskCount} overdue ${applicationSummary.overdueTaskCount === 1 ? "task" : "tasks"}`
            : applicationSummary.nearestDeadline
              ? `Next: ${applicationSummary.nearestDeadline.opportunityTitle} · ${formatShortDate(applicationSummary.nearestDeadline.date)}`
              : `${applicationSummary.activeCount} active`,
      percent: activeTaskTotals.total > 0 ? applicationMomentumPercent : null,
      done: applicationSummary.activeCount > 0 && applicationSummary.overdueTaskCount === 0,
      actionLabel: applicationSummary.activeCount === 0 ? "Get started" : "Continue",
      href: applicationSummary.nearestDeadline ? `/applications/${applicationSummary.nearestDeadline.planId}` : "/applications",
    },
    {
      key: "saved",
      label: "Review saved opportunities",
      detail: savedIds.size === 0 ? "Nothing saved yet" : `${savedIds.size} saved ${savedIds.size === 1 ? "opportunity" : "opportunities"}`,
      percent: null,
      done: savedIds.size > 0,
      actionLabel: savedIds.size === 0 ? "Browse opportunities" : "View saved",
      href: savedIds.size === 0 ? "/opportunities" : "/saved",
    },
    {
      key: "reminders",
      label: "Add a reminder",
      detail:
        reminders.length === 0
          ? "No reminders set yet"
          : reminderSummary.next
            ? `Next: ${reminderSummary.next.title} — ${formatReminderDateTime(reminderSummary.next.remind_at)}`
            : `${reminders.length} ${reminders.length === 1 ? "reminder" : "reminders"} set`,
      percent: null,
      done: reminders.length > 0,
      actionLabel: reminders.length === 0 ? "Add reminder" : "View reminders",
      href: "/reminders",
    },
  ];

  const featuredEntry = allChosenEntries[0] ?? null;
  const recommendedEntries = allChosenEntries.slice(0, 3);

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-6 py-8 sm:py-10">
      <DashboardHeader firstName={firstName} />

      <DashboardOverview
        profileStrengthPercent={profileStrengthPercent}
        applicationMomentumPercent={applicationMomentumPercent}
        activeApplicationCount={applicationSummary.activeCount}
        completedTaskCount={activeTaskTotals.completed}
        totalTaskCount={activeTaskTotals.total}
        strongMatchCount={strongMatchCount}
        savedCount={savedIds.size}
        upcomingDeadlineCount={applicationSummary.upcomingDeadlineCount}
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PriorityActionPanel
            overdueTaskCount={applicationSummary.overdueTaskCount}
            nearestDeadline={applicationSummary.nearestDeadline}
            overdueReminderCount={reminderSummary.overdueCount}
            nextReminder={reminderSummary.next ? { title: reminderSummary.next.title, remindAt: reminderSummary.next.remind_at } : null}
            nextReminderHref={nextReminderHref}
            featured={featuredEntry}
          />
        </div>

        <section aria-labelledby="upcoming-heading" className="flex flex-col gap-1 rounded-lg border border-border bg-card px-3 py-3">
          <h2 id="upcoming-heading" className="px-2 text-xs font-semibold tracking-wide text-primary uppercase">
            Up next
          </h2>

          {reminderSummary.next && (
            <UpcomingActionRow
              icon={Bell}
              tone={reminderSummary.overdueCount > 0 ? "coral" : "primary"}
              title={reminderSummary.next.title}
              detail={formatReminderDateTime(reminderSummary.next.remind_at)}
              href={nextReminderHref}
            />
          )}

          {applicationSummary.nearestDeadline && (
            <UpcomingActionRow
              icon={CalendarClock}
              tone="gold"
              title={`${applicationSummary.nearestDeadline.opportunityTitle} deadline`}
              detail={formatShortDate(applicationSummary.nearestDeadline.date)}
              href={`/applications/${applicationSummary.nearestDeadline.planId}`}
            />
          )}

          {savedIds.size > 0 && (
            <UpcomingActionRow
              icon={Bookmark}
              tone="muted"
              title={`${savedIds.size} saved ${savedIds.size === 1 ? "opportunity" : "opportunities"}`}
              detail="Ready to review"
              href="/saved"
            />
          )}

          {!reminderSummary.next && !applicationSummary.nearestDeadline && savedIds.size === 0 && (
            <p className="px-2 py-3 text-sm text-muted-foreground">Nothing scheduled yet — explore opportunities to get started.</p>
          )}
        </section>
      </div>

      <section aria-labelledby="recommended-heading" className="flex flex-col gap-3 rounded-lg border border-border bg-card px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h2 id="recommended-heading" className="text-xs font-semibold tracking-wide text-primary uppercase">
            Recommended for you
          </h2>
          <Link href="/opportunities" className="shrink-0 text-xs font-medium text-primary underline-offset-4 hover:underline">
            View all
          </Link>
        </div>

        {poolError ? (
          <EmptyState icon={AlertTriangle} title="Couldn't load your matches." description={poolError} />
        ) : chosenForYou.status === "empty" ? (
          <>
            <EmptyState
              icon={Compass}
              title="We haven't verified any opportunities matching your profile yet."
              description="Check back soon as more are verified, browse everything we have so far, or search fresh sources now."
              action={{ label: "Browse Opportunities", href: "/opportunities" }}
            />
            <DiscoverMore />
          </>
        ) : (
          <>
            <div className="divide-y divide-border">
              {recommendedEntries.map((entry) => (
                <RecommendedOpportunityRow
                  key={entry.opportunity.id}
                  opportunity={entry.opportunity}
                  matchResult={entry.matchResult}
                  isSaved={savedIds.has(entry.opportunity.id)}
                  whyItFits={entry.matchResult.tier !== "limited_fit" ? (entry.matchResult.reasons[0] ?? null) : null}
                />
              ))}
            </div>

            {chosenForYou.status === "exhausted" && <DiscoverMore />}

            {chosenForYou.status === "only_broader_remaining" && chosenForYou.nextShown !== null && (
              <div className="flex flex-col items-start gap-2 rounded-md bg-secondary px-4 py-3">
                <p role="status" className="text-sm text-muted-foreground">
                  I found a few more, but they are not as closely matched to your interests and preferences.
                </p>
                <FindMoreButton href={`/dashboard?shown=${chosenForYou.nextShown}`} />
              </div>
            )}

            {chosenForYou.status === "has_more" && chosenForYou.nextShown !== null && (
              <div className="flex flex-col items-start gap-2 rounded-md bg-secondary px-4 py-3">
                <p className="text-sm text-foreground">Want to see a few more matches?</p>
                <FindMoreButton href={`/dashboard?shown=${chosenForYou.nextShown}`} />
              </div>
            )}
          </>
        )}
      </section>

      <ProgressChecklist items={checklistItems} />

      <p className="text-sm text-muted-foreground">
        Interested in {interests.length > 0 ? interests.slice(0, 3).join(", ") : "something new"}? Update your interests and goals on your{" "}
        <Link href="/profile" className="font-medium text-primary underline-offset-4 hover:underline">
          profile
        </Link>
        .
      </p>
    </div>
  );
}

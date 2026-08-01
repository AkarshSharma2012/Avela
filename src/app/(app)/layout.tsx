import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { requireProfile } from "@/lib/auth/dal";
import { getCachedApplicationPlans } from "@/lib/applications/dal";
import { buildDashboardApplicationSummary } from "@/lib/applications/summary";

/**
 * Shared layout for every authenticated route (dashboard, opportunities,
 * saved, profile, settings). Gates on both auth and onboarding completion
 * here so individual pages don't each repeat the check.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const profile = await requireProfile();

  if (!profile.onboarding_completed) {
    redirect("/onboarding");
  }

  // Powers the sidebar's compact "Your week" snapshot — real data, and via
  // getCachedApplicationPlans's request-level cache, never a second query
  // when the dashboard page also reads the same plans.
  const applicationBundles = await getCachedApplicationPlans(profile.id);
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

  return (
    <AppShell email={profile.email} weekSnapshot={{ activeCount: applicationSummary.activeCount, nearestDeadline: applicationSummary.nearestDeadline }}>
      {children}
    </AppShell>
  );
}

import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { requireProfile } from "@/lib/auth/dal";

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

  return <AppShell email={profile.email}>{children}</AppShell>;
}

import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { LogoutButton } from "@/components/auth/logout-button";
import { requireProfile } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Dashboard — Avela",
};

export default async function DashboardPage() {
  const profile = await requireProfile();

  if (!profile.onboarding_completed) {
    redirect("/onboarding");
  }

  const displayName = profile.display_name?.trim() || profile.email;

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-4xl flex-col px-6 py-12">
      <header className="flex items-center justify-between border-b border-border pb-6">
        <span className="font-heading text-lg font-semibold text-foreground">
          Avela
        </span>
        <LogoutButton />
      </header>

      <main className="flex flex-1 flex-col justify-center py-16">
        <p className="mb-3 text-xs font-medium tracking-wide text-primary uppercase">
          Dashboard
        </p>
        <h1 className="font-heading text-3xl break-words text-foreground sm:text-4xl">
          Welcome, {displayName}.
        </h1>
        <p className="mt-4 max-w-lg text-base leading-relaxed text-text-secondary">
          Your personalized opportunities, goals, and achievements will live
          here as they&apos;re built in upcoming milestones.
        </p>
      </main>
    </div>
  );
}

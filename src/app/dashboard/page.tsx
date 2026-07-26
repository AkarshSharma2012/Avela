import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { LogoutButton } from "@/components/auth/logout-button";
import { requireProfile } from "@/lib/auth/dal";
import { getOnboardingSummary } from "@/lib/onboarding/dal";

export const metadata: Metadata = {
  title: "Dashboard — Avela",
};

export default async function DashboardPage() {
  const profile = await requireProfile();

  if (!profile.onboarding_completed) {
    redirect("/onboarding");
  }

  const displayName = profile.display_name?.trim() || profile.email;
  const { interests, otherInterestText, goals } = await getOnboardingSummary(profile.id);

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-4xl flex-col px-6 py-12">
      <header className="flex items-center justify-between border-b border-border pb-6">
        <span className="font-heading text-lg font-semibold text-foreground">
          Avela
        </span>
        <LogoutButton />
      </header>

      <main className="flex flex-1 flex-col py-12">
        <p className="mb-3 text-xs font-medium tracking-wide text-primary uppercase">
          Dashboard
        </p>
        <h1 className="font-heading text-3xl break-words text-foreground sm:text-4xl">
          Welcome, {displayName}.
        </h1>
        <p className="mt-4 max-w-lg text-base leading-relaxed text-text-secondary">
          Here&apos;s what we know about you so far.
        </p>

        <dl className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="rounded-md border border-border bg-card px-5 py-4">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Grade level
            </dt>
            <dd className="mt-1 text-base text-foreground">
              {profile.grade_level ? `Grade ${profile.grade_level}` : "Not set"}
            </dd>
          </div>

          <div className="rounded-md border border-border bg-card px-5 py-4">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Guided Mode
            </dt>
            <dd className="mt-1 text-base text-foreground">
              {profile.guided_mode ? "On" : "Off"}
            </dd>
          </div>

          <div className="rounded-md border border-border bg-card px-5 py-4 sm:col-span-2">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Interests
            </dt>
            <dd className="mt-2 flex flex-wrap gap-2">
              {interests.length > 0 ? (
                interests.map((interest) => (
                  <span
                    key={interest}
                    className="rounded-full border border-border bg-secondary px-3 py-1 text-sm text-foreground"
                  >
                    {interest === "Other" && otherInterestText
                      ? `Other (${otherInterestText})`
                      : interest}
                  </span>
                ))
              ) : (
                <span className="text-base text-text-secondary">Not set</span>
              )}
            </dd>
          </div>

          <div className="rounded-md border border-border bg-card px-5 py-4 sm:col-span-2">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Current goals
            </dt>
            <dd className="mt-2 flex flex-wrap gap-2">
              {goals.length > 0 ? (
                goals.map((goal) => (
                  <span
                    key={goal}
                    className="rounded-full border border-border bg-secondary px-3 py-1 text-sm text-foreground"
                  >
                    {goal}
                  </span>
                ))
              ) : (
                <span className="text-base text-text-secondary">Not set</span>
              )}
            </dd>
          </div>
        </dl>

        <div className="mt-10 rounded-md border border-dashed border-border bg-secondary px-6 py-8">
          <p className="text-sm font-medium text-foreground">
            Personalized opportunities are on the way
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Matching you to opportunities, goals, and achievements based on
            what you told us arrives in Milestone 3 and beyond.
          </p>
        </div>
      </main>
    </div>
  );
}

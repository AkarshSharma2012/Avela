import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { LogoutButton } from "@/components/auth/logout-button";
import { requireProfile } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Onboarding — Avela",
};

export default async function OnboardingPage() {
  const profile = await requireProfile();

  if (profile.onboarding_completed) {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-col justify-center px-6 py-16">
      <p className="mb-3 text-xs font-medium tracking-wide text-primary uppercase">
        Getting started
      </p>
      <h1 className="font-heading text-3xl text-foreground sm:text-4xl">
        Let&apos;s personalize Avela.
      </h1>
      <p className="mt-4 max-w-lg text-base leading-relaxed text-text-secondary">
        You&apos;re signed in as{" "}
        <span className="font-medium text-foreground break-words">
          {profile.email}
        </span>
        .
        The full profile setup — grade level, interests, and goals — arrives
        in Milestone 2. For now, this confirms your account and profile are
        ready to go.
      </p>

      <div className="mt-10 rounded-md border border-dashed border-border bg-secondary px-6 py-8">
        <p className="text-sm font-medium text-foreground">Profile setup</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Coming in Milestone 2.
        </p>
        <div
          role="progressbar"
          aria-valuenow={0}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Profile setup progress"
          className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full w-0 bg-primary" />
        </div>
      </div>

      <div className="mt-10 flex items-center justify-between border-t border-border pt-6">
        <p className="text-sm text-muted-foreground">
          You can log out and come back later.
        </p>
        <LogoutButton />
      </div>
    </div>
  );
}

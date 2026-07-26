import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { LogoutButton } from "@/components/auth/logout-button";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
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
    <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-col overflow-x-hidden px-6 py-12 sm:py-16">
      <header className="animate-fade-up mb-10 flex items-center justify-between">
        <span className="font-heading text-lg font-semibold text-foreground">
          Avela
        </span>
        <LogoutButton />
      </header>

      <div className="stagger-children mb-8">
        <p className="animate-fade-up mb-3 text-xs font-medium tracking-wide text-primary uppercase">
          Getting started
        </p>
        <h1 className="animate-fade-up font-heading text-3xl text-foreground sm:text-4xl">
          Let&apos;s personalize Avela.
        </h1>
        <p className="animate-fade-up mt-4 max-w-lg text-base leading-relaxed text-text-secondary">
          A few quick questions — this helps us tailor opportunities to you
          later on. You can change any of this afterward.
        </p>
      </div>

      <OnboardingWizard />
    </div>
  );
}

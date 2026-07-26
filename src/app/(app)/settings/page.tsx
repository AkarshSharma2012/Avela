import type { Metadata } from "next";

import { LogoutButton } from "@/components/auth/logout-button";
import { getAuthenticatedUser, requireProfile } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Settings — Avela",
};

export default async function SettingsPage() {
  const profile = await requireProfile();
  const user = await getAuthenticatedUser();
  const emailVerified = Boolean(user?.email_confirmed_at);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col px-6 py-10 sm:py-12">
      <div className="stagger-children">
        <p className="animate-fade-up mb-3 text-xs font-medium tracking-wide text-primary uppercase">
          Settings
        </p>
        <h1 className="animate-fade-up font-heading text-3xl text-foreground sm:text-4xl">
          Account settings.
        </h1>
      </div>

      <section aria-labelledby="account-heading" className="animate-fade-up mt-10">
        <h2
          id="account-heading"
          className="text-xs font-medium tracking-wide text-primary uppercase"
        >
          Account
        </h2>
        <dl className="mt-4 space-y-4">
          <div className="rounded-md border border-border bg-card px-5 py-4">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Email
            </dt>
            <dd className="mt-1 text-base break-all text-foreground">{profile.email}</dd>
          </div>
          <div className="rounded-md border border-border bg-card px-5 py-4">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Email verification
            </dt>
            <dd className="mt-1 text-base text-foreground">
              {emailVerified ? "Verified" : "Not verified"}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          Email confirmation is disabled for early access — your account is active immediately
          after signup.
        </p>
      </section>

      <section aria-labelledby="security-heading" className="animate-fade-up mt-8">
        <h2
          id="security-heading"
          className="text-xs font-medium tracking-wide text-primary uppercase"
        >
          Account &amp; security
        </h2>
        <div className="mt-4 rounded-md border border-dashed border-border bg-secondary px-6 py-6">
          <p className="text-sm text-foreground">
            More account and security controls are coming soon.
          </p>
        </div>
      </section>

      <section aria-labelledby="session-heading" className="animate-fade-up mt-8">
        <h2
          id="session-heading"
          className="text-xs font-medium tracking-wide text-primary uppercase"
        >
          Session
        </h2>
        <div className="mt-4">
          <LogoutButton />
        </div>
      </section>
    </div>
  );
}

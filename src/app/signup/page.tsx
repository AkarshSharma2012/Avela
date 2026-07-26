import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { SignupForm } from "@/components/auth/signup-form";
import { AuthShell } from "@/components/layout/auth-shell";
import { getCurrentProfile } from "@/lib/auth/dal";
import { getPostAuthDestination } from "@/lib/auth/route-rules";

export const metadata: Metadata = {
  title: "Sign up — Avela",
};

export default async function SignupPage() {
  const profile = await getCurrentProfile();

  if (profile) {
    redirect(getPostAuthDestination(profile));
  }

  return (
    <AuthShell
      eyebrow="Get started"
      title="Create your Avela account"
      description="Avela helps students organize opportunities, goals, and achievements — all in one place."
    >
      <SignupForm />
    </AuthShell>
  );
}

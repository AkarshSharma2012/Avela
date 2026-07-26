import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/login-form";
import { AuthShell } from "@/components/layout/auth-shell";
import { getCurrentProfile } from "@/lib/auth/dal";
import { getPostAuthDestination } from "@/lib/auth/route-rules";

export const metadata: Metadata = {
  title: "Log in — Avela",
};

export default async function LoginPage() {
  const profile = await getCurrentProfile();

  if (profile) {
    redirect(getPostAuthDestination(profile));
  }

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Log in to Avela"
      description="Pick up where you left off organizing your opportunities, goals, and achievements."
    >
      <LoginForm />
    </AuthShell>
  );
}

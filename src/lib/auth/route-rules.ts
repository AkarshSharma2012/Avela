// Pure routing-decision helpers shared by proxy.ts (optimistic checks) and
// the server-component pages (authoritative checks). Kept dependency-free
// so they're trivially unit-testable — see tests/auth/route-rules.test.ts.

export const PROTECTED_PATHS = [
  "/dashboard",
  "/onboarding",
  "/opportunities",
  "/saved",
  "/profile",
  "/settings",
  "/portfolio",
  "/applications",
  "/reminders",
];

/** Routes that require an authenticated session at minimum. */
export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export type OnboardingProfile = { onboarding_completed: boolean } | null;

/** Where a visitor should land given their profile (or lack of one). */
export function getPostAuthDestination(
  profile: OnboardingProfile
): "/login" | "/dashboard" | "/onboarding" {
  if (!profile) return "/login";
  return profile.onboarding_completed ? "/dashboard" : "/onboarding";
}

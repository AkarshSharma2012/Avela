import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/profile";

// This module reads `next/headers` transitively via the Supabase server
// client, so Next.js already refuses to bundle it into a Client Component.

export const getAuthenticatedUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Combines the Supabase Auth user with their `profiles` row.
 *
 * Tolerates the brief window right after signup where the
 * `handle_new_user` trigger may not have committed yet by falling back to
 * an in-memory profile shape with `onboarding_completed: false`, rather
 * than treating a missing row as "signed out".
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const user = await getAuthenticatedUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[auth] failed to load profile:", error.message);
  }

  if (profile) return profile;

  const fallbackTimestamp = user.created_at ?? new Date().toISOString();
  return {
    id: user.id,
    email: user.email ?? "",
    display_name: null,
    grade_level: null,
    city: null,
    state: null,
    country: "United States",
    weekly_availability: null,
    experience_level: null,
    guided_mode: false,
    onboarding_version: 1,
    onboarding_completed: false,
    onboarding_completed_at: null,
    created_at: fallbackTimestamp,
    updated_at: fallbackTimestamp,
  };
});

/** Redirects unauthenticated visitors to /login; otherwise returns their profile. */
export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }
  return profile;
}

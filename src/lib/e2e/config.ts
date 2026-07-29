/**
 * Safety gate for the whole E2E test-account system (spec section 16).
 * Every function in src/lib/e2e/* checks requireE2eTestUsersAllowed() and
 * requireIsolatedE2eBackend() before doing anything and fails closed
 * exactly like isGithubOauthConfigured() does — no flag, no isolated
 * backend, no seeding, no cleanup, ever, no matter what else is passed in.
 * Never imported by a Client Component; this whole directory is
 * server-only tooling (scripts/, and this module's own Node-only checks).
 *
 * Deliberately uses its own E2E_SUPABASE_URL / E2E_SUPABASE_ANON_KEY /
 * E2E_SUPABASE_SERVICE_ROLE_KEY env vars — never the app's normal
 * NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — and refuses to run
 * at all if the E2E project URL matches the production one. This system
 * must never be able to write a single row to the real, production
 * Supabase project under any configuration.
 */

import { createClient as createServiceRoleClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

/** Every synthetic account and every generated item title carries one of these two markers — cleanup only ever touches rows that match. */
export const E2E_EMAIL_DOMAIN = "e2e.avela.invalid";
export const E2E_TITLE_PREFIX = "[E2E TEST] ";

export function isE2eTestUsersAllowed(): boolean {
  return process.env.ALLOW_E2E_TEST_USERS === "true";
}

/** Throws if the flag is off — every caller in this directory calls this first, so a missing flag is a loud, early failure, never a silent no-op that could be mistaken for "nothing to seed/clean." */
export function requireE2eTestUsersAllowed(): void {
  if (!isE2eTestUsersAllowed()) {
    throw new Error("E2E test-user operations are disabled — set ALLOW_E2E_TEST_USERS=true to enable them. Never do this in production.");
  }
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

export type IsolatedE2eBackendConfig = { url: string; anonKey: string; serviceRoleKey: string };

/**
 * Never returns a config built from the app's production env vars, even
 * partially — every field here comes from the dedicated E2E_SUPABASE_*
 * vars only. Throws (never silently falls back) when any is missing, or
 * when the E2E project URL matches the production NEXT_PUBLIC_SUPABASE_URL
 * — the one check that exists specifically to make "accidentally testing
 * against production" structurally impossible, not just discouraged.
 */
export function requireIsolatedE2eBackend(): IsolatedE2eBackendConfig {
  const url = process.env.E2E_SUPABASE_URL;
  const anonKey = process.env.E2E_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error(
      "E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY, and E2E_SUPABASE_SERVICE_ROLE_KEY must all be set to a dedicated, isolated Supabase project (a separate test project, or local Supabase via the CLI) — the E2E system never falls back to the app's production Supabase project."
    );
  }

  const productionUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (productionUrl && normalizeUrl(url) === normalizeUrl(productionUrl)) {
    throw new Error(
      "E2E_SUPABASE_URL matches NEXT_PUBLIC_SUPABASE_URL (the production project) — refusing to run. Point E2E_SUPABASE_URL at a separate test project or local Supabase instance."
    );
  }

  return { url, anonKey, serviceRoleKey };
}

export function isIsolatedE2eBackendConfigured(): boolean {
  try {
    requireIsolatedE2eBackend();
    return true;
  } catch {
    return false;
  }
}

/** Same construction as createVerificationServiceRoleClient/createClaimsServiceRoleClient, but always against the isolated E2E project — never the app's production client. */
export function createE2eServiceRoleClient(): Client {
  requireE2eTestUsersAllowed();
  const { url, serviceRoleKey } = requireIsolatedE2eBackend();
  return createServiceRoleClient<Database>(url, serviceRoleKey, { auth: { persistSession: false } });
}

/** A synthetic, never-real E2E email — always this domain, always a fresh random local part so re-seeding never collides. */
export function generateE2eEmail(persona: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `e2e+${persona}-${random}@${E2E_EMAIL_DOMAIN}`;
}

/** A random password, long enough to satisfy Supabase's own minimum — never logged, never reused, never meant to be typed by a human. */
export function generateE2ePassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

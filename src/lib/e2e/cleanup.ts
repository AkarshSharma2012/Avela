/**
 * Removes every E2E-marked account (spec section 16) — service-role only,
 * gated by requireE2eTestUsersAllowed(). A user only ever qualifies for
 * deletion when BOTH markers agree: `user_metadata.e2e_test === true` AND
 * the email ends in the synthetic E2E domain — a single coincidental match
 * on either marker alone is never enough. Deleting the auth.users row
 * cascades (on delete cascade) through every table that references it
 * (portfolio_items, portfolio_files, connected_identities, etc.), so no
 * separate per-table cleanup is needed. Idempotent: a second run finds
 * nothing left to remove and returns an empty result, never an error.
 */

import { createE2eServiceRoleClient, requireE2eTestUsersAllowed, E2E_EMAIL_DOMAIN } from "@/lib/e2e/config";

export type E2eCleanupCandidate = { userId: string; email: string };

export type E2eCleanupResult = {
  /** Every candidate found — populated in both dry-run and real runs. */
  candidates: E2eCleanupCandidate[];
  /** Only populated when dryRun is false — the ones actually deleted. */
  deleted: E2eCleanupCandidate[];
  errors: string[];
  dryRun: boolean;
};

function isGenuineE2eUser(user: { email?: string | null; user_metadata?: Record<string, unknown> | null }): boolean {
  const emailMatches = Boolean(user.email && user.email.toLowerCase().endsWith(`@${E2E_EMAIL_DOMAIN}`));
  const metadataMatches = user.user_metadata?.e2e_test === true;
  return emailMatches && metadataMatches;
}

/** Paginates through every Supabase Auth user rather than assuming a single page holds them all — safe for however many E2E accounts a scenario run left behind. */
async function listAllE2eCandidates(supabase: ReturnType<typeof createE2eServiceRoleClient>): Promise<E2eCleanupCandidate[]> {
  const candidates: E2eCleanupCandidate[] = [];
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Failed to list users during E2E cleanup: ${error.message}`);
    for (const user of data.users) {
      if (isGenuineE2eUser(user)) candidates.push({ userId: user.id, email: user.email ?? "" });
    }
    if (data.users.length < perPage) break;
    page += 1;
  }
  return candidates;
}

/**
 * Deletes exactly one E2E-marked user by id — used by the Playwright
 * per-test fixture (tests/e2e/fixtures/e2e-session.ts) so a parallel
 * test's teardown never touches another concurrently-running test's
 * persona. Still re-verifies both markers server-side before deleting,
 * never trusting the caller's claim that a given id is an E2E user.
 */
export async function deleteSingleE2eUser(userId: string): Promise<{ error: string | null }> {
  requireE2eTestUsersAllowed();
  const supabase = createE2eServiceRoleClient();

  const { data, error: getError } = await supabase.auth.admin.getUserById(userId);
  if (getError || !data.user) return { error: getError?.message ?? "User not found." };
  if (!isGenuineE2eUser(data.user)) {
    return { error: "Refusing to delete — this user is not marked as an E2E test account." };
  }

  const { error } = await supabase.auth.admin.deleteUser(userId);
  return { error: error?.message ?? null };
}

export async function cleanupE2ePersonas({ dryRun = false }: { dryRun?: boolean } = {}): Promise<E2eCleanupResult> {
  requireE2eTestUsersAllowed();
  const supabase = createE2eServiceRoleClient();

  const candidates = await listAllE2eCandidates(supabase);
  if (dryRun) {
    return { candidates, deleted: [], errors: [], dryRun: true };
  }

  const deleted: E2eCleanupCandidate[] = [];
  const errors: string[] = [];
  for (const candidate of candidates) {
    const { error } = await supabase.auth.admin.deleteUser(candidate.userId);
    if (error) {
      errors.push(`${candidate.email}: ${error.message}`);
    } else {
      deleted.push(candidate);
    }
  }

  return { candidates, deleted, errors, dryRun: false };
}

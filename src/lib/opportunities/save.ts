/**
 * Dependency-free save/unsave logic, separated from `save-actions.ts` (the
 * "use server" entry point) the same way `completeOnboarding` is separated
 * from `submitOnboarding` — so the authorization-critical part (never
 * writing without a resolved session user id, never trusting a
 * client-supplied one) is unit-testable without mocking Next.js or
 * Supabase. Neither function takes a `userId` parameter from outside a
 * resolved session: the only identity these ever act on is whatever the
 * caller already authenticated as.
 */

export type SaveResult = { success: true } | { success: false; error: string };

type WriteFn = (
  userId: string,
  opportunityId: string
) => Promise<{ error: string | null }>;

export async function saveOpportunityForUser(
  userId: string | null,
  opportunityId: string,
  insert: WriteFn
): Promise<SaveResult> {
  if (userId === null) {
    return { success: false, error: "You need to be signed in to save opportunities." };
  }

  const { error } = await insert(userId, opportunityId);
  if (error) {
    console.error("[opportunities] failed to save opportunity:", error);
    return { success: false, error: "Couldn't save this opportunity. Please try again." };
  }

  return { success: true };
}

export async function unsaveOpportunityForUser(
  userId: string | null,
  opportunityId: string,
  remove: WriteFn
): Promise<SaveResult> {
  if (userId === null) {
    return { success: false, error: "You need to be signed in to manage saved opportunities." };
  }

  const { error } = await remove(userId, opportunityId);
  if (error) {
    console.error("[opportunities] failed to unsave opportunity:", error);
    return { success: false, error: "Couldn't remove this opportunity. Please try again." };
  }

  return { success: true };
}

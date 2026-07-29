/**
 * Combines the original env-var reviewer allowlist
 * (verification/reviewer-auth.ts, unchanged) with the new user_roles table
 * — purely additive OR, so every reviewer who worked before this milestone
 * keeps working with zero config changes. A DB role check failure (e.g.
 * the service-role key missing) never itself denies access when the
 * allowlist already grants it — the two checks are independent, not
 * chained.
 */

import { isAuthorizedReviewer } from "@/lib/verification/reviewer-auth";
import { createRolesServiceRoleClient, listRolesForUser } from "@/lib/roles/repository";
import type { UserRoleValue } from "@/types/database";

const ROLE_HIERARCHY: readonly UserRoleValue[] = ["student", "reviewer", "admin", "owner"];

function roleSatisfies(roles: UserRoleValue[], required: UserRoleValue): boolean {
  const requiredIndex = ROLE_HIERARCHY.indexOf(required);
  return roles.some((role) => ROLE_HIERARCHY.indexOf(role) >= requiredIndex);
}

/** Reviewer authorization: allowlisted-by-env OR has reviewer/admin/owner in user_roles. Never throws — a role-lookup failure just falls back to the allowlist result alone. */
export async function isAuthorizedReviewerAsync(userId: string, email: string | null | undefined): Promise<boolean> {
  if (isAuthorizedReviewer(email)) return true;
  try {
    const serviceClient = createRolesServiceRoleClient();
    const roles = await listRolesForUser(serviceClient, userId);
    return roleSatisfies(roles, "reviewer");
  } catch (err) {
    console.error("[roles] role lookup unavailable, falling back to allowlist result only:", err);
    return false;
  }
}

export async function isAuthorizedAdminAsync(userId: string): Promise<boolean> {
  try {
    const serviceClient = createRolesServiceRoleClient();
    const roles = await listRolesForUser(serviceClient, userId);
    return roleSatisfies(roles, "admin");
  } catch (err) {
    console.error("[roles] role lookup unavailable:", err);
    return false;
  }
}

/** A reviewer can never decide a claim that is their own (spec section 11) — structural, not a judgment call. */
export function hasConflictOfInterest(reviewerUserId: string, claimOwnerUserId: string): boolean {
  return reviewerUserId === claimOwnerUserId;
}

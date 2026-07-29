"use server";

/** Reviewer-only entry points into integrity_signals/integrity_reviews — every row in those tables has zero client-facing RLS policy (see the migration), so authorization here is the only gate standing between a reviewer and the data. */

import { getAuthenticatedUser } from "@/lib/auth/dal";
import { isAuthorizedReviewerAsync } from "@/lib/roles/access";
import { createIntegrityServiceRoleClient, listSignalsRequiringReview, recordIntegrityReview } from "@/lib/integrity/repository";
import { containsForbiddenLanguage } from "@/lib/verification/messages";
import type { IntegrityReviewDecision, IntegritySignal } from "@/types/integrity";

export async function getIntegritySignalsForReviewer(): Promise<{ signals: IntegritySignal[]; error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user || !(await isAuthorizedReviewerAsync(user.id, user.email))) return { signals: [], error: "Not authorized." };

  const serviceClient = createIntegrityServiceRoleClient();
  const signals = await listSignalsRequiringReview(serviceClient);
  return { signals };
}

export async function decideIntegritySignal(signalId: string, subjectUserId: string, decision: IntegrityReviewDecision, reason: string): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user || !(await isAuthorizedReviewerAsync(user.id, user.email))) return { error: "Not authorized." };
  if (!reason.trim()) return { error: "A reason is required." };
  if (containsForbiddenLanguage(reason)) {
    return { error: "Please describe what's missing or mismatched without characterizing the student." };
  }
  if (user.id === subjectUserId) return { error: "You can't review a signal about your own account." };

  const serviceClient = createIntegrityServiceRoleClient();
  const { error } = await recordIntegrityReview(serviceClient, {
    userId: subjectUserId,
    signalId,
    reviewerEmail: user.email ?? "",
    decision,
    reason: reason.trim(),
  });
  if (error) return { error: "Couldn't save that decision. Please try again." };
  return {};
}

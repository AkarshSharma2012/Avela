"use server";

/**
 * Server actions for frictionless external confirmation (spec Part 10).
 * A genuine third-party human response is allowed to set
 * 'externally_confirmed' — unlike the AI grader (spec Part 6), a real
 * named reviewer confirming their own knowledge is exactly the kind of
 * external confirmation claim dimensions are meant to capture. "Cannot
 * verify" never downgrades a dimension — a reviewer not knowing something
 * is not evidence against it.
 */

import { getAuthenticatedUser } from "@/lib/auth/dal";
import { applyDimensionTransition, ensureDimensionRow } from "@/lib/claims/repository";
import { ALL_CLAIM_DIMENSIONS, CLAIM_DIMENSION_LABELS } from "@/lib/claims/constants";
import {
  createConfirmationServiceRoleClient,
  getConfirmationRequestByTokenHash,
  insertConfirmationRequest,
  listConfirmationRequestsForItem,
  revokeConfirmationRequest,
  submitConfirmationResponse,
} from "@/lib/confirmations/repository";
import { computeVerificationExpiry, generateVerificationToken, hashVerificationToken, isTokenExpired } from "@/lib/verification/tokens";
import { responseStatusToDimensionStatus } from "@/lib/confirmations/dimension-mapping";
import { createClient } from "@/lib/supabase/server";
import type { ClaimDimension } from "@/types/claims";
import type { ConfirmationResponseStatus, ConfirmationReviewerRole, PortfolioConfirmationRequest } from "@/types/portfolio";

const CONFIRMATION_LINK_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

export type CreateConfirmationRequestResult = { token?: string; error?: string };

export async function createConfirmationRequestAction(input: {
  portfolioItemId: string;
  claimDimensions: string[];
  reviewerRole: ConfirmationReviewerRole;
  reviewerEmail: string | null;
  reviewerDisplayName: string | null;
  studentContextNote: string | null;
}): Promise<CreateConfirmationRequestResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in to request a confirmation." };

  const validDimensions = input.claimDimensions.filter((d): d is ClaimDimension => (ALL_CLAIM_DIMENSIONS as readonly string[]).includes(d));
  if (validDimensions.length === 0) return { error: "Choose at least one thing to ask about." };

  const supabase = await createClient();
  const rawToken = generateVerificationToken();
  const tokenHash = hashVerificationToken(rawToken);
  const expiresAt = computeVerificationExpiry(new Date(), CONFIRMATION_LINK_TTL_SECONDS).toISOString();

  const { requestId, error } = await insertConfirmationRequest(supabase, user.id, {
    portfolioItemId: input.portfolioItemId,
    claimDimensions: validDimensions,
    reviewerRole: input.reviewerRole,
    reviewerEmail: input.reviewerEmail?.trim() || null,
    reviewerDisplayName: input.reviewerDisplayName?.trim() || null,
    studentContextNote: input.studentContextNote?.trim() || null,
    tokenHash,
    expiresAt,
  });

  if (error || !requestId) {
    console.error("[confirmations] failed to create confirmation request:", error);
    return { error: "Couldn't create that confirmation request. Please try again." };
  }

  return { token: rawToken };
}

export async function listConfirmationRequestsForItemAction(itemId: string): Promise<PortfolioConfirmationRequest[]> {
  const user = await getAuthenticatedUser();
  if (!user) return [];
  const supabase = await createClient();
  return listConfirmationRequestsForItem(supabase, user.id, itemId);
}

export async function revokeConfirmationRequestAction(requestId: string): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in." };
  const supabase = await createClient();
  const { error } = await revokeConfirmationRequest(supabase, user.id, requestId);
  return error ? { error: "Couldn't revoke that request." } : {};
}

export type ReviewerConfirmationView = {
  itemTitle: string;
  claimDimensionLabels: string[];
  reviewerDisplayName: string | null;
  studentContextNote: string | null;
};

export async function getConfirmationRequestForReviewer(rawToken: string): Promise<ReviewerConfirmationView | null> {
  if (!rawToken || rawToken.length < 16) return null;
  const tokenHash = hashVerificationToken(rawToken);
  const found = await getConfirmationRequestByTokenHash(tokenHash);
  if (!found) return null;
  if (found.request.revoked_at) return null;
  if (found.request.responded_at) return null;
  if (isTokenExpired(found.request.expires_at)) return null;

  return {
    itemTitle: found.itemTitle,
    claimDimensionLabels: found.request.claim_dimensions.map((d) => CLAIM_DIMENSION_LABELS[d as ClaimDimension] ?? d),
    reviewerDisplayName: found.request.reviewer_display_name,
    studentContextNote: found.request.student_context_note,
  };
}

export type SubmitConfirmationResult = { success: true } | { success: false; error: string };

/** Never blocks on a claim-dimension write failure — the reviewer's response is already durably recorded by the time dimension rollup runs, so a downstream error here degrades to "response saved, rollup will catch up" rather than losing the reviewer's answer. */
export async function submitConfirmationResponseAction(rawToken: string, status: ConfirmationResponseStatus, note: string): Promise<SubmitConfirmationResult> {
  if (!rawToken || rawToken.length < 16) return { success: false, error: "This confirmation link isn't valid." };
  const tokenHash = hashVerificationToken(rawToken);

  const found = await getConfirmationRequestByTokenHash(tokenHash);
  if (!found) return { success: false, error: "This confirmation link isn't valid." };

  const trimmedNote = note.trim().slice(0, 1000) || null;
  const result = await submitConfirmationResponse(tokenHash, status, trimmedNote);
  if (!result.success) return result;

  await applyClaimDimensionUpdates(found.request, status);
  return { success: true };
}

async function applyClaimDimensionUpdates(request: PortfolioConfirmationRequest, status: ConfirmationResponseStatus): Promise<void> {
  const newStatus = responseStatusToDimensionStatus(status);
  if (!newStatus) return; // "cannot_verify" never changes a dimension's status.

  const serviceClient = createConfirmationServiceRoleClient();
  for (const dimension of request.claim_dimensions as ClaimDimension[]) {
    const { result } = await ensureDimensionRow(serviceClient, request.user_id, request.portfolio_item_id, dimension);
    if (!result) continue;
    await applyDimensionTransition(serviceClient, result, {
      status: newStatus,
      actorType: "verifier",
      reason: `External confirmation from a ${request.reviewer_role.replace(/_/g, " ")}.`,
    });
  }
}

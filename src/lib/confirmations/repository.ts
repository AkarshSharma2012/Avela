/**
 * DB access for frictionless external confirmation requests (spec Part
 * 10) — a narrower, richer sibling of the existing verifier-confirms-a-
 * claim flow (src/lib/verification/repository.ts), scoped to specific
 * claim dimensions instead of a whole item. Same client-vs-service-role
 * split as review-links/repository.ts: student reads/writes use the
 * caller's RLS-enforced client; the anonymous reviewer's read/response
 * always uses the service-role connection.
 */

import { createVerificationServiceRoleClient } from "@/lib/verification/repository";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ConfirmationResponseStatus, ConfirmationReviewerRole, PortfolioConfirmationRequest } from "@/types/portfolio";

export { createVerificationServiceRoleClient as createConfirmationServiceRoleClient };

type Client = SupabaseClient<Database>;

export type CreateConfirmationRequestInput = {
  portfolioItemId: string;
  claimDimensions: string[];
  reviewerRole: ConfirmationReviewerRole;
  reviewerEmail: string | null;
  reviewerDisplayName: string | null;
  studentContextNote: string | null;
  tokenHash: string;
  expiresAt: string;
};

export async function insertConfirmationRequest(
  supabase: Client,
  userId: string,
  input: CreateConfirmationRequestInput
): Promise<{ requestId: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from("portfolio_confirmation_requests")
    .insert({
      user_id: userId,
      portfolio_item_id: input.portfolioItemId,
      claim_dimensions: input.claimDimensions,
      reviewer_role: input.reviewerRole,
      reviewer_email: input.reviewerEmail,
      reviewer_display_name: input.reviewerDisplayName,
      student_context_note: input.studentContextNote,
      token_hash: input.tokenHash,
      expires_at: input.expiresAt,
    })
    .select("id")
    .single();

  return { requestId: data?.id ?? null, error: error?.message ?? null };
}

export async function listConfirmationRequestsForItem(supabase: Client, userId: string, itemId: string): Promise<PortfolioConfirmationRequest[]> {
  const { data } = await supabase
    .from("portfolio_confirmation_requests")
    .select("*")
    .eq("user_id", userId)
    .eq("portfolio_item_id", itemId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function revokeConfirmationRequest(supabase: Client, userId: string, requestId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("portfolio_confirmation_requests")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("user_id", userId);
  return { error: error?.message ?? null };
}

/** Service-role only, same reasoning as review-links' getReviewLinkByTokenHash — a reviewer never has a session. */
export async function getConfirmationRequestByTokenHash(tokenHash: string): Promise<{ request: PortfolioConfirmationRequest; itemTitle: string } | null> {
  const supabase = createVerificationServiceRoleClient();
  const { data: request } = await supabase.from("portfolio_confirmation_requests").select("*").eq("token_hash", tokenHash).maybeSingle();
  if (!request) return null;

  const { data: item } = await supabase.from("portfolio_items").select("title").eq("id", request.portfolio_item_id).maybeSingle();
  return { request, itemTitle: item?.title ?? "this entry" };
}

const MAX_RESPONSE_ATTEMPTS = 5;

export type SubmitConfirmationResponseResult = { success: true } | { success: false; error: string };

/**
 * Single-use: once responded_at is set, every further attempt is rejected,
 * and every attempt (successful or not) increments attempt_count as a
 * simple rate-limit/audit signal (spec Part 10/14) — never silently
 * retried past MAX_RESPONSE_ATTEMPTS.
 */
export async function submitConfirmationResponse(
  tokenHash: string,
  status: ConfirmationResponseStatus,
  note: string | null
): Promise<SubmitConfirmationResponseResult> {
  const supabase = createVerificationServiceRoleClient();
  const { data: request } = await supabase.from("portfolio_confirmation_requests").select("*").eq("token_hash", tokenHash).maybeSingle();

  if (!request) return { success: false, error: "This confirmation link isn't valid." };
  if (request.revoked_at) return { success: false, error: "This confirmation request was withdrawn by the student." };
  if (new Date(request.expires_at) <= new Date()) return { success: false, error: "This confirmation link has expired." };
  if (request.responded_at) return { success: false, error: "This confirmation has already been submitted." };
  if (request.attempt_count >= MAX_RESPONSE_ATTEMPTS) return { success: false, error: "Too many attempts on this link." };

  const { error } = await supabase
    .from("portfolio_confirmation_requests")
    .update({
      response_status: status,
      response_note: note,
      responded_at: new Date().toISOString(),
      attempt_count: request.attempt_count + 1,
    })
    .eq("id", request.id);

  if (error) return { success: false, error: "Couldn't record your response. Please try again." };
  return { success: true };
}

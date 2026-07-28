"use server";

/**
 * Every student- and reviewer-facing entry point into the OSINT engine
 * (spec sections 3, 9, 10). Mirrors src/lib/verification/actions.ts's
 * shape: student actions run on the caller's own session client (RLS
 * enforced), reviewer actions are allowlist-gated and use a service-role
 * client obtained the same defensive way.
 */

import { revalidatePath } from "next/cache";

import { getAuthenticatedUser, getCurrentProfile } from "@/lib/auth/dal";
import { claimTypeForItemType } from "@/lib/osint/claim-eligibility";
import { normalizeGithubUsername } from "@/lib/osint/github-identity";
import { buildConsentSummary, freezeConsentScope, validateConsentGiven, type ConsentSummary } from "@/lib/osint/consent";
import { assertRespectfulLanguage } from "@/lib/osint/messages";
import { runOsintCheck } from "@/lib/osint/orchestrator";
import * as repo from "@/lib/osint/repository";
import * as portfolioRepo from "@/lib/portfolio/repository";
import { isAuthorizedReviewer } from "@/lib/verification/reviewer-auth";
import * as verificationRepo from "@/lib/verification/repository";
import { createClient } from "@/lib/supabase/server";
import type { ClaimInput } from "@/lib/osint/types";
import type { OsintCheckWithFindings, PortfolioOsintReviewAction, PortfolioOsintSupportLevel } from "@/types/osint";
import type { OsintReviewQueueEntry } from "@/lib/osint/repository";

export type OsintActionResult = { error?: string };

function revalidateOsintPages(itemId: string) {
  revalidatePath(`/portfolio/items/${itemId}`);
  revalidatePath("/portfolio/review");
}

function getServiceRoleClientOrError(): { client: ReturnType<typeof repo.createOsintServiceRoleClient> } | { error: string } {
  try {
    return { client: repo.createOsintServiceRoleClient() };
  } catch (err) {
    console.error("[osint] service-role client unavailable:", err);
    return { error: "This action isn't available right now. Please try again later." };
  }
}

async function buildClaimForItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  itemId: string
): Promise<{ claim: ClaimInput; itemType: string } | { error: string }> {
  const item = await portfolioRepo.getPortfolioItem(supabase, userId, itemId);
  if (!item) return { error: "Couldn't find that portfolio item." };

  const claimType = claimTypeForItemType(item.item_type);
  if (!claimType) {
    return { error: "This kind of entry isn't eligible for a public-source check." };
  }

  const profile = await getCurrentProfile();
  const claim: ClaimInput = {
    claimType,
    studentDisplayName: profile?.display_name || "",
    title: item.title,
    organization: item.organization,
    role: item.role,
    description: item.description,
    startDate: item.start_date,
    endDate: item.end_date,
    url: item.url,
    connectedGithubUsername: normalizeGithubUsername(item.github_username),
  };
  if (!claim.studentDisplayName) return { error: "Add your display name to your profile before running a public-source check." };

  return { claim, itemType: item.item_type };
}

// --- Student actions ---------------------------------------------------------

export async function getOsintConsentPreview(itemId: string): Promise<{ summary: ConsentSummary | null; error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { summary: null, error: "You need to be signed in." };

  const supabase = await createClient();
  const claimResult = await buildClaimForItem(supabase, user.id, itemId);
  if ("error" in claimResult) return { summary: null, error: claimResult.error };

  return { summary: buildConsentSummary(claimResult.claim) };
}

export async function getLatestOsintCheck(itemId: string): Promise<{ check: OsintCheckWithFindings | null; error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { check: null, error: "You need to be signed in." };

  const supabase = await createClient();
  const check = await repo.getLatestCheckForItem(supabase, user.id, itemId);
  if (!check) return { check: null };

  const [evidence, conflicts] = await Promise.all([
    repo.listEvidenceForCheck(supabase, user.id, check.id),
    repo.listConflictsForCheck(supabase, user.id, check.id),
  ]);
  return { check: { ...check, evidence, conflicts } };
}

/** Starts (or re-runs — spec section 9's "recheck action") a public-source check. Never starts without explicit, freshly-given consent (spec section 3). */
export async function startOsintCheck(itemId: string, consentGiven: boolean): Promise<OsintActionResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in to run a public-source check." };

  const consentError = validateConsentGiven(consentGiven);
  if (consentError) return { error: consentError };

  const supabase = await createClient();
  const claimResult = await buildClaimForItem(supabase, user.id, itemId);
  if ("error" in claimResult) return { error: claimResult.error };

  const { claim } = claimResult;
  const consentSummary = buildConsentSummary(claim);
  const consentScope = freezeConsentScope(consentSummary);

  const existingVerification = await verificationRepo.getVerificationForItem(supabase, user.id, itemId);
  const existingVerificationContext = existingVerification
    ? { level: existingVerification.verification_level, hasUploadedEvidence: Boolean(existingVerification.evidence_file_id || existingVerification.evidence_url) }
    : null;

  const { error } = await runOsintCheck({
    supabase,
    userId: user.id,
    itemId,
    claim,
    consentScope,
    existingVerification: existingVerificationContext,
  });
  if (error) return { error };

  revalidateOsintPages(itemId);
  return {};
}

/** Deletes every public-source check (and its evidence/conflicts, via cascade) for this item — spec section 9's "delete public-source evidence." Never touches portfolio_verifications or its own evidence. */
export async function deleteOsintEvidence(itemId: string): Promise<OsintActionResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in." };

  const supabase = await createClient();
  const { error } = await repo.deleteChecksForItem(supabase, user.id, itemId);
  if (error) {
    console.error("[osint] failed to delete evidence:", error);
    return { error: "Couldn't delete that evidence. Please try again." };
  }

  revalidateOsintPages(itemId);
  return {};
}

// --- Reviewer actions (authenticated, allowlisted) --------------------------

export async function getOsintReviewQueueForReviewer(): Promise<{ entries: OsintReviewQueueEntry[]; error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user || !isAuthorizedReviewer(user.email)) return { entries: [], error: "Not authorized." };

  const clientResult = getServiceRoleClientOrError();
  if ("error" in clientResult) return { entries: [], error: clientResult.error };
  const entries = await repo.listOsintReviewQueue(clientResult.client);
  return { entries };
}

export async function getOsintCheckForReviewer(checkId: string): Promise<{ data: Awaited<ReturnType<typeof repo.getCheckWithFindingsAsServiceRole>>; error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user || !isAuthorizedReviewer(user.email)) return { data: null, error: "Not authorized." };

  const clientResult = getServiceRoleClientOrError();
  if ("error" in clientResult) return { data: null, error: clientResult.error };
  const data = await repo.getCheckWithFindingsAsServiceRole(clientResult.client, checkId);
  return { data };
}

/** Every reviewer decision on an osint check — confirm/clarify/insufficient/override — always writes an audit row (spec section 10: "Every decision must be audited"). */
export async function osintReviewerDecide(
  checkId: string,
  action: PortfolioOsintReviewAction,
  reason: string,
  overrideLevel?: PortfolioOsintSupportLevel
): Promise<OsintActionResult> {
  const user = await getAuthenticatedUser();
  if (!user?.email || !isAuthorizedReviewer(user.email)) return { error: "Not authorized." };

  if (!reason.trim()) return { error: "Add a reason for this decision." };
  if (reason.length > 2000) return { error: "That reason is too long." };
  const languageError = assertRespectfulLanguage(reason);
  if (languageError) return { error: languageError };

  const clientResult = getServiceRoleClientOrError();
  if ("error" in clientResult) return { error: clientResult.error };
  const serviceClient = clientResult.client;

  const found = await repo.getCheckWithFindingsAsServiceRole(serviceClient, checkId);
  if (!found) return { error: "Couldn't find that check." };

  let newLevel = found.check.final_support_level;
  if (action === "confirm_support") newLevel = "confirmed_by_authoritative_source";
  else if (action === "mark_insufficient") newLevel = "unable_to_verify";
  else if (action === "request_clarification") newLevel = "needs_review";
  else if (action === "override_support_level") {
    if (!overrideLevel) return { error: "Choose a support level to override to." };
    newLevel = overrideLevel;
  }

  const { error: updateError } = await repo.updateCheckAsServiceRole(serviceClient, checkId, { final_support_level: newLevel });
  if (updateError) {
    console.error("[osint] failed to save reviewer decision:", updateError);
    return { error: "Couldn't save that decision. Please try again." };
  }

  await repo.insertReviewEventAsServiceRole(serviceClient, {
    user_id: found.check.user_id,
    check_id: checkId,
    reviewer_email: user.email,
    action,
    previous_support_level: found.check.final_support_level,
    new_support_level: newLevel,
    reason: reason.trim(),
  });

  revalidatePath(`/portfolio/items/${found.check.portfolio_item_id}`);
  revalidatePath("/portfolio/review");
  return {};
}

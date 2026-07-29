"use server";

import { revalidatePath } from "next/cache";

import { siteConfig } from "@/config/site";
import { getAuthenticatedUser, getCurrentProfile } from "@/lib/auth/dal";
import { applyDimensionTransition, createClaimsServiceRoleClient, ensureDimensionRow, listDimensionsForUser, markDimensionStale } from "@/lib/claims/repository";
import { getEmailProvider } from "@/lib/email/provider";
import * as portfolioRepo from "@/lib/portfolio/repository";
import { VERIFICATION_LINK_EXPIRY_SECONDS } from "@/lib/verification/constants";
import { buildVerificationRequestEmail } from "@/lib/verification/email-templates";
import { runEvidenceChecks, type EvidenceFinding } from "@/lib/verification/evidence-checks";
import { gatherDomainContext } from "@/lib/verification/domain-context";
import { dimensionsForFieldConfirmation, THIRD_PARTY_CONFIRMATION_DIMENSION, VERIFICATION_FIELD_OPTIONS } from "@/lib/verification/field-confirmation";
import { runFieldConfirmationScopeCheck, runVerifierIntegrityChecks } from "@/lib/integrity/orchestrator";
import { checkAndIncrementRateLimit, checkAndIncrementRateLimitForUser } from "@/lib/integrity/rate-limit";
import { canTransitionLevel } from "@/lib/verification/level";
import { containsForbiddenLanguage } from "@/lib/verification/messages";
import { validateOrganizationRequirement } from "@/lib/verification/project-context";
import { hasConflictOfInterest, isAuthorizedReviewerAsync } from "@/lib/roles/access";
import {
  checkRequestEligibility,
  checkResendEligibility,
  deriveRequestStatus,
  type RequestStatus,
} from "@/lib/verification/request";
import * as repo from "@/lib/verification/repository";
import { computeVerificationExpiry, generateVerificationToken, hashVerificationToken, isTokenExpired } from "@/lib/verification/tokens";
import { checkOfficialUrl } from "@/lib/verification/url-check";
import { classifyVerifierDomain } from "@/lib/verification/verifier-legitimacy";
import {
  validateCorrectionNote,
  validateEvidenceUrl,
  validateReviewNotes,
  validateVerifierEmail,
  validateVerifierName,
  validateVerifierOrganization,
} from "@/lib/verification/validation";
import { createClient } from "@/lib/supabase/server";
import type { PortfolioVerificationLevel, PortfolioVerificationMethod, VerificationFieldConfirmationField, VerificationFieldConfirmationResponse } from "@/types/database";
import type { ClaimDimension } from "@/types/claims";
import type { PortfolioVerificationMetadata, PortfolioVerification } from "@/types/verification";
import type { VerifierClaimView, ReviewQueueEntry } from "@/lib/verification/repository";

export type VerificationActionResult = { error?: string };

function revalidateVerificationPages(itemId: string) {
  revalidatePath(`/portfolio/items/${itemId}`);
  revalidatePath("/portfolio");
}

function formatDateRangeLabel(startDate: string | null, endDate: string | null): string | null {
  if (!startDate && !endDate) return null;
  const format = (value: string) => new Date(value).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  if (startDate && endDate) return `${format(startDate)}–${format(endDate)}`;
  if (startDate) return `Since ${format(startDate)}`;
  return null;
}

function findingsToNotes(findings: EvidenceFinding[]): string | null {
  if (findings.length === 0) return null;
  const notes = findings.map((f) => f.message).join(" ");
  return notes.length > 2000 ? notes.slice(0, 1997) + "..." : notes;
}

/**
 * Wraps repo.createVerificationServiceRoleClient() so a missing
 * SUPABASE_SERVICE_ROLE_KEY/NEXT_PUBLIC_SUPABASE_URL never surfaces as an
 * uncaught exception out of a Server Action — only a generic, secret-free
 * message ever reaches the client; the actual error (which itself never
 * contains the key's value, only its env var *name*) is logged server-side
 * only.
 */
function getServiceRoleClientOrError(): { client: ReturnType<typeof repo.createVerificationServiceRoleClient> } | { error: string } {
  try {
    return { client: repo.createVerificationServiceRoleClient() };
  } catch (err) {
    console.error("[verification] service-role client unavailable:", err);
    return { error: "This action isn't available right now. Please try again later." };
  }
}

/**
 * Best-effort, never blocking (spec section 12: "connector failures do not
 * block saving"): gathers domain context for the verifier's email,
 * classifies it, and records a verifier_domain_assessments row for
 * reviewer-only anti-collusion signals. A failure here is logged and
 * swallowed — the request itself has already succeeded by the time this
 * runs.
 */
async function recordVerifierDomainAssessment(
  userId: string,
  itemId: string,
  verificationId: string,
  verifierEmail: string,
  verifierOrganization: string | null
): Promise<void> {
  try {
    const context = await gatherDomainContext(verifierEmail, verifierOrganization);
    const classification = classifyVerifierDomain({ organization: verifierOrganization, context });
    const domain = context?.domain ?? (verifierEmail.split("@")[1] ?? "").toLowerCase();
    if (!domain) return;

    const serviceClient = repo.createVerificationServiceRoleClient();
    await repo.insertVerifierDomainAssessmentAsServiceRole(serviceClient, {
      user_id: userId,
      portfolio_item_id: itemId,
      verification_id: verificationId,
      verifier_email_domain: domain,
      official_domain: null,
      classification,
      has_mx: context?.hasMx ?? false,
      has_spf: context?.hasSpf ?? false,
      has_dmarc: context?.hasDmarc ?? false,
      domain_registered_at: context?.domainRegisteredAt ?? null,
      is_free_email_provider: context?.isFreeEmailProvider ?? false,
      is_role_mailbox: context?.isRoleMailbox ?? false,
    });

    await runVerifierIntegrityChecks(userId, verifierEmail, classification);
  } catch (err) {
    console.error("[verification] failed to record verifier domain assessment:", err);
  }
}

/** Best-effort, never blocking — a failure here never stops the evidence save from succeeding, it just means a stale claim dimension isn't caught until the next check. */
async function downgradeDimensionsForReplacedEvidence(userId: string, itemId: string, oldFileId: string | null, oldUrl: string | null): Promise<void> {
  if (!oldFileId && !oldUrl) return;
  try {
    const serviceClient = createClaimsServiceRoleClient();
    const byItem = await listDimensionsForUser(serviceClient, userId);
    const affected = (byItem.get(itemId) ?? []).filter((row) => {
      const ref = row.evidence_ref as { evidence_file_id?: string; evidence_url?: string } | null;
      return (oldFileId && ref?.evidence_file_id === oldFileId) || (oldUrl && ref?.evidence_url === oldUrl);
    });
    for (const row of affected) {
      await markDimensionStale(serviceClient, row, "The evidence this was based on was replaced.");
    }
  } catch (err) {
    console.error("[verification] failed to downgrade dimensions after evidence replacement:", err);
  }
}

function statusOf(verification: PortfolioVerification, now: Date = new Date()): RequestStatus {
  return deriveRequestStatus(
    {
      requestedAt: verification.requested_at,
      verifiedAt: verification.verified_at,
      expiresAt: verification.expires_at,
      verificationLevel: verification.verification_level,
      metadata: repo.metadataOf(verification),
    },
    now
  );
}

// --- Student actions: add/replace evidence ----------------------------------

type EvidenceTarget = { fileId: string } | { url: string };

async function applyEvidenceSubmission(
  itemId: string,
  target: EvidenceTarget,
  eventType: "evidence_added" | "evidence_replaced" | "official_url_added"
): Promise<VerificationActionResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in to update evidence." };

  const supabase = await createClient();
  const item = await portfolioRepo.getPortfolioItem(supabase, user.id, itemId);
  if (!item) return { error: "Couldn't find that portfolio item." };

  let fileMimeType: string | null = null;
  let fileReadable = true;
  let originalFilename: string | null = null;
  let officialUrlFinding: EvidenceFinding | null = null;
  let officialUrlDomain: string | null = null;

  if ("fileId" in target) {
    const file = await portfolioRepo.getPortfolioFile(supabase, user.id, target.fileId);
    if (!file) return { error: "Couldn't find that file." };
    if (file.portfolio_item_id !== itemId) return { error: "That file isn't attached to this item." };
    fileMimeType = file.mime_type;
    fileReadable = file.file_size > 0;
    originalFilename = file.original_filename;
  } else {
    const urlError = validateEvidenceUrl(target.url);
    if (urlError) return { error: urlError };
    const urlCheck = checkOfficialUrl(target.url);
    if (!urlCheck.valid) return { error: urlCheck.error };
    officialUrlDomain = urlCheck.hostname;
    if (urlCheck.isSocialMedia) {
      officialUrlFinding = { code: "url_not_official", message: "This doesn't look like an official page for this organization — it can still be added as evidence.", severity: "warning" };
    }
  }

  const { verification, error: ensureError } = await repo.ensureVerificationRow(supabase, user.id, itemId);
  if (ensureError || !verification) return { error: "Couldn't save that evidence. Please try again." };

  const duplicate = await repo.findDuplicateEvidenceUsage(supabase, user.id, itemId, "fileId" in target ? { fileId: target.fileId } : { url: target.url });

  const checkResult = runEvidenceChecks({
    hasEvidence: true,
    fileMimeType,
    fileReadable,
    originalFilename,
    evidenceUrl: "url" in target ? target.url : null,
    itemType: item.item_type,
    portfolioOrganization: item.organization,
    portfolioStartDate: item.start_date,
    portfolioEndDate: item.end_date,
    isReusedOnUnrelatedItem: duplicate,
  });
  const findings = officialUrlFinding ? [...checkResult.findings, officialUrlFinding] : checkResult.findings;
  // checkResult.recommendedLevel's type is only ever "evidence_added" |
  // "needs_review" (see evidence-checks.ts) — a trusted/official-looking
  // domain (urlCheck.isTrustedDomain above) is never consulted here and
  // can never push this to "externally_confirmed". That level is reachable
  // only through confirmVerifierClaim or reviewerDecide below, both of
  // which require an explicit verifier/reviewer decision.
  const newLevel: PortfolioVerificationLevel = checkResult.recommendedLevel;

  if (!canTransitionLevel(verification.verification_level, "evidence_added", "student")) {
    return { error: "This item can't accept new evidence right now." };
  }

  const method: PortfolioVerificationMethod = "fileId" in target ? "uploaded_document" : "official_url";
  const previousLevel = verification.verification_level;

  const { error: updateError } = await repo.updateVerification(supabase, user.id, verification.id, {
    verification_level: newLevel,
    verification_method: method,
    evidence_file_id: "fileId" in target ? target.fileId : null,
    evidence_url: "url" in target ? target.url : null,
    review_notes: findingsToNotes(findings),
    requested_at: null,
    verified_at: null,
    expires_at: null,
    verification_code_hash: null,
    metadata: officialUrlDomain ? ({ official_url_domain: officialUrlDomain } satisfies PortfolioVerificationMetadata) : {},
  });
  if (updateError) {
    console.error("[verification] failed to save evidence:", updateError);
    return { error: "Couldn't save that evidence. Please try again." };
  }

  await repo.insertVerificationEvent(supabase, {
    user_id: user.id,
    portfolio_item_id: itemId,
    verification_id: verification.id,
    event_type: eventType,
    actor_type: "student",
    previous_level: previousLevel,
    new_level: "evidence_added",
    reason: null,
  });

  if (newLevel === "needs_review") {
    await repo.insertVerificationEvent(supabase, {
      user_id: user.id,
      portfolio_item_id: itemId,
      verification_id: verification.id,
      event_type: "consistency_check_run",
      actor_type: "system",
      previous_level: "evidence_added",
      new_level: "needs_review",
      reason: findingsToNotes(findings),
    });
  }

  // Spec section 8: replacing evidence re-triggers evaluation of anything
  // that depended on the *old* evidence — a dimension whose evidence_ref
  // pointed at the file/URL being replaced no longer has that backing.
  if (eventType === "evidence_replaced") {
    await downgradeDimensionsForReplacedEvidence(user.id, itemId, verification.evidence_file_id, verification.evidence_url);
  }

  revalidateVerificationPages(itemId);
  return {};
}

export async function attachEvidenceFile(itemId: string, fileId: string): Promise<VerificationActionResult> {
  return applyEvidenceSubmission(itemId, { fileId }, "evidence_added");
}

export async function addOfficialUrl(itemId: string, url: string): Promise<VerificationActionResult> {
  return applyEvidenceSubmission(itemId, { url }, "official_url_added");
}

export async function replaceEvidence(itemId: string, target: EvidenceTarget): Promise<VerificationActionResult> {
  return applyEvidenceSubmission(itemId, target, "evidence_replaced");
}

// --- Student actions: email verification request flow ----------------------

export type RequestVerificationInput = {
  method: Extract<PortfolioVerificationMethod, "organization_email" | "teacher_or_mentor" | "recommendation_contact">;
  verifierName: string;
  verifierEmail: string;
  verifierOrganization?: string | null;
  consentGiven: boolean;
};

export async function requestVerification(itemId: string, input: RequestVerificationInput): Promise<VerificationActionResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in to request verification." };

  const nameError = validateVerifierName(input.verifierName);
  if (nameError) return { error: nameError };
  const emailError = validateVerifierEmail(input.verifierEmail);
  if (emailError) return { error: emailError };
  const orgError = validateVerifierOrganization(input.verifierOrganization ?? null);
  if (orgError) return { error: orgError };

  const supabase = await createClient();
  const item = await portfolioRepo.getPortfolioItem(supabase, user.id, itemId);
  if (!item) return { error: "Couldn't find that portfolio item." };

  const orgRequirementError = validateOrganizationRequirement(item.project_context, input.verifierOrganization ?? null);
  if (orgRequirementError) return { error: orgRequirementError };

  const rateLimit = await checkAndIncrementRateLimit(supabase, "verification_request");
  if (!rateLimit.allowed) return { error: "You've reached the limit for this request type — try again later." };

  const { verification, error: ensureError } = await repo.ensureVerificationRow(supabase, user.id, itemId);
  if (ensureError || !verification) return { error: "Couldn't start that request. Please try again." };

  const currentStatus = statusOf(verification);
  const studentEmail = user.email ?? "";
  const eligibility = checkRequestEligibility({
    currentStatus,
    consentGiven: input.consentGiven,
    verifierEmail: input.verifierEmail,
    studentEmail,
  });
  if (!eligibility.allowed) return { error: eligibility.error };

  const rawToken = generateVerificationToken();
  const tokenHash = hashVerificationToken(rawToken);
  const now = new Date();
  const expiresAt = computeVerificationExpiry(now);

  const { error: updateError } = await repo.updateVerification(supabase, user.id, verification.id, {
    verification_method: input.method,
    verifier_name: input.verifierName.trim(),
    verifier_email: input.verifierEmail.trim(),
    verifier_organization: input.verifierOrganization?.trim() || null,
    verification_code_hash: tokenHash,
    requested_at: now.toISOString(),
    verified_at: null,
    expires_at: expiresAt.toISOString(),
    metadata: { resend_count: 0, last_sent_at: now.toISOString() } satisfies PortfolioVerificationMetadata,
  });
  if (updateError) {
    console.error("[verification] failed to save request:", updateError);
    return { error: "Couldn't start that request. Please try again." };
  }

  await repo.insertVerificationEvent(supabase, {
    user_id: user.id,
    portfolio_item_id: itemId,
    verification_id: verification.id,
    event_type: "verification_requested",
    actor_type: "student",
    previous_level: verification.verification_level,
    new_level: verification.verification_level,
    reason: null,
  });

  await recordVerifierDomainAssessment(user.id, itemId, verification.id, input.verifierEmail.trim(), input.verifierOrganization ?? null);

  const profile = await getCurrentProfile();
  const emailBody = buildVerificationRequestEmail({
    verifierName: input.verifierName.trim(),
    studentDisplayName: profile?.display_name || "A student",
    itemTitle: item.title,
    itemType: item.item_type,
    itemOrganization: item.organization,
    dateRangeLabel: formatDateRangeLabel(item.start_date, item.end_date),
    verificationUrl: `${siteConfig.url}/verify/${rawToken}`,
    expiryDaysFromNow: Math.round(VERIFICATION_LINK_EXPIRY_SECONDS / 86400),
  });
  await getEmailProvider().send({ ...emailBody, to: input.verifierEmail.trim() });

  revalidateVerificationPages(itemId);
  return {};
}

export async function resendVerificationRequest(itemId: string): Promise<VerificationActionResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in." };

  const supabase = await createClient();
  const item = await portfolioRepo.getPortfolioItem(supabase, user.id, itemId);
  if (!item) return { error: "Couldn't find that portfolio item." };

  const verification = await repo.getVerificationForItem(supabase, user.id, itemId);
  if (!verification || !verification.verifier_email || !verification.verifier_name) {
    return { error: "There's no pending request to resend." };
  }
  if (statusOf(verification) !== "pending") return { error: "There's no pending request to resend." };

  const rateLimit = await checkAndIncrementRateLimit(supabase, "verification_resend");
  if (!rateLimit.allowed) return { error: "You've reached the limit for this request type — try again later." };

  const metadata = repo.metadataOf(verification);
  const eligibility = checkResendEligibility({ resendCount: metadata.resend_count ?? 0, lastSentAt: metadata.last_sent_at ?? null });
  if (!eligibility.allowed) return { error: eligibility.error };

  const rawToken = generateVerificationToken();
  const tokenHash = hashVerificationToken(rawToken);
  const now = new Date();
  const expiresAt = computeVerificationExpiry(now);

  const { error: updateError } = await repo.updateVerification(supabase, user.id, verification.id, {
    verification_code_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
    metadata: { ...metadata, resend_count: (metadata.resend_count ?? 0) + 1, last_sent_at: now.toISOString() } satisfies PortfolioVerificationMetadata,
  });
  if (updateError) {
    console.error("[verification] failed to resend request:", updateError);
    return { error: "Couldn't resend that request. Please try again." };
  }

  await repo.insertVerificationEvent(supabase, {
    user_id: user.id,
    portfolio_item_id: itemId,
    verification_id: verification.id,
    event_type: "verification_resent",
    actor_type: "student",
    previous_level: verification.verification_level,
    new_level: verification.verification_level,
    reason: null,
  });

  const profile = await getCurrentProfile();
  const emailBody = buildVerificationRequestEmail({
    verifierName: verification.verifier_name,
    studentDisplayName: profile?.display_name || "A student",
    itemTitle: item.title,
    itemType: item.item_type,
    itemOrganization: item.organization,
    dateRangeLabel: formatDateRangeLabel(item.start_date, item.end_date),
    verificationUrl: `${siteConfig.url}/verify/${rawToken}`,
    expiryDaysFromNow: Math.round(VERIFICATION_LINK_EXPIRY_SECONDS / 86400),
  });
  await getEmailProvider().send({ ...emailBody, to: verification.verifier_email });

  revalidateVerificationPages(itemId);
  return {};
}

export async function cancelVerificationRequest(itemId: string): Promise<VerificationActionResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in." };

  const supabase = await createClient();
  const verification = await repo.getVerificationForItem(supabase, user.id, itemId);
  if (!verification) return { error: "There's no request to cancel." };
  if (statusOf(verification) !== "pending") return { error: "There's no pending request to cancel." };

  const metadata = repo.metadataOf(verification);
  const { error: updateError } = await repo.updateVerification(supabase, user.id, verification.id, {
    verification_code_hash: null,
    metadata: { ...metadata, cancelled_at: new Date().toISOString() } satisfies PortfolioVerificationMetadata,
  });
  if (updateError) {
    console.error("[verification] failed to cancel request:", updateError);
    return { error: "Couldn't cancel that request. Please try again." };
  }

  await repo.insertVerificationEvent(supabase, {
    user_id: user.id,
    portfolio_item_id: itemId,
    verification_id: verification.id,
    event_type: "verification_cancelled",
    actor_type: "student",
    previous_level: verification.verification_level,
    new_level: verification.verification_level,
    reason: null,
  });

  revalidateVerificationPages(itemId);
  return {};
}

// --- Verifier actions (public, token-based, no session) --------------------

export async function getVerifierClaim(rawToken: string): Promise<{ claim: VerifierClaimView | null; error: string | null }> {
  if (!rawToken || rawToken.length < 16) return { claim: null, error: "This verification link isn't valid." };

  const tokenHash = hashVerificationToken(rawToken);
  const clientResult = getServiceRoleClientOrError();
  if ("error" in clientResult) return { claim: null, error: clientResult.error };
  const claim = await repo.findVerifierClaimByTokenHash(clientResult.client, tokenHash);
  if (!claim) return { claim: null, error: "This verification link isn't valid, or has already been used." };
  if (isTokenExpired(claim.verification.expires_at)) {
    return { claim: null, error: "This verification link has expired." };
  }
  return { claim, error: null };
}

async function resolveVerifierClaim(
  rawToken: string,
  next: { level: PortfolioVerificationLevel; eventType: "verification_confirmed" | "verification_declined" | "correction_requested"; metadataPatch?: Partial<PortfolioVerificationMetadata>; reason?: string | null }
): Promise<VerificationActionResult> {
  const { claim, error } = await getVerifierClaim(rawToken);
  if (!claim) return { error: error ?? "This verification link isn't valid." };

  if (!canTransitionLevel(claim.verification.verification_level, next.level, "verifier")) {
    return { error: "This item can no longer be responded to." };
  }

  const clientResult = getServiceRoleClientOrError();
  if ("error" in clientResult) return { error: clientResult.error };
  const serviceClient = clientResult.client;
  const metadata = repo.metadataOf(claim.verification);
  const { error: updateError } = await repo.updateVerificationAsServiceRole(serviceClient, claim.verification.id, {
    verification_level: next.level,
    verified_at: next.level === "externally_confirmed" ? new Date().toISOString() : claim.verification.verified_at,
    // Single-use: clearing the hash means this same link can never be used again, confirm/decline/correction alike.
    verification_code_hash: null,
    metadata: { ...metadata, ...next.metadataPatch } satisfies PortfolioVerificationMetadata,
  });
  if (updateError) {
    console.error("[verification] failed to resolve verifier claim:", updateError);
    return { error: "Couldn't save your response. Please try again." };
  }

  await repo.insertVerificationEventAsServiceRole(serviceClient, {
    user_id: claim.verification.user_id,
    portfolio_item_id: claim.verification.portfolio_item_id,
    verification_id: claim.verification.id,
    event_type: next.eventType,
    actor_type: "verifier",
    previous_level: claim.verification.verification_level,
    new_level: next.level,
    reason: next.reason ?? null,
  });

  revalidatePath(`/portfolio/items/${claim.verification.portfolio_item_id}`);
  revalidatePath("/portfolio");
  return {};
}

export async function confirmVerifierClaim(rawToken: string): Promise<VerificationActionResult> {
  return resolveVerifierClaim(rawToken, { level: "externally_confirmed", eventType: "verification_confirmed" });
}

export async function declineVerifierClaim(rawToken: string): Promise<VerificationActionResult> {
  return resolveVerifierClaim(rawToken, {
    level: "needs_review",
    eventType: "verification_declined",
    metadataPatch: { declined_at: new Date().toISOString() },
    reason: "The verifier wasn't able to confirm this entry.",
  });
}

export async function requestCorrectionFromVerifier(rawToken: string, note: string): Promise<VerificationActionResult> {
  const noteError = validateCorrectionNote(note);
  if (noteError) return { error: noteError };

  return resolveVerifierClaim(rawToken, {
    level: "needs_review",
    eventType: "correction_requested",
    metadataPatch: { correction_requested_at: new Date().toISOString(), correction_note: note.trim() },
    reason: note.trim() || null,
  });
}

export type FieldConfirmationSubmission = {
  field: VerificationFieldConfirmationField;
  response: VerificationFieldConfirmationResponse;
  note?: string;
};

/**
 * The verifier's field-by-field response (spec section 5) — never a single
 * "confirm everything" action. Each field independently updates only the
 * claim dimension(s) it maps to (field-confirmation.ts), and every
 * response — of any kind — supports the third_party_confirmation dimension,
 * since a legitimate third party responding to specific fields is exactly
 * what that dimension records.
 */
export async function submitVerifierFieldConfirmations(rawToken: string, submissions: FieldConfirmationSubmission[]): Promise<VerificationActionResult> {
  if (submissions.length === 0) return { error: "Select at least one field to respond to." };

  for (const submission of submissions) {
    if (submission.note && containsForbiddenLanguage(submission.note)) {
      return { error: "Please describe what's missing or mismatched without characterizing the student." };
    }
  }

  const { claim, error } = await getVerifierClaim(rawToken);
  if (!claim) return { error: error ?? "This verification link isn't valid." };

  const clientResult = getServiceRoleClientOrError();
  if ("error" in clientResult) return { error: clientResult.error };
  const serviceClient = clientResult.client;

  const rateLimit = await checkAndIncrementRateLimitForUser(serviceClient, claim.verification.user_id, "verifier_response");
  if (!rateLimit.allowed) return { error: "You've reached the limit for this request type — try again later." };

  const { error: upsertError } = await repo.upsertFieldConfirmationsAsServiceRole(
    serviceClient,
    submissions.map((submission) => ({
      user_id: claim.verification.user_id,
      portfolio_item_id: claim.verification.portfolio_item_id,
      verification_id: claim.verification.id,
      field: submission.field,
      response: submission.response,
      note: submission.note?.trim() || null,
    }))
  );
  if (upsertError) {
    console.error("[verification] failed to save field confirmations:", upsertError);
    return { error: "Couldn't save that response. Please try again." };
  }

  const dimensionsSupported = new Set<ClaimDimension>();
  for (const submission of submissions) {
    for (const dimension of dimensionsForFieldConfirmation(submission.field, submission.response)) {
      dimensionsSupported.add(dimension);
    }
  }
  const anyConfirmed = submissions.some((s) => s.response === "can_confirm");
  const anyUnresolved = submissions.some((s) => s.response !== "can_confirm");

  for (const dimension of dimensionsSupported) {
    const { result } = await ensureDimensionRow(serviceClient, claim.verification.user_id, claim.verification.portfolio_item_id, dimension);
    if (result) {
      await applyDimensionTransition(serviceClient, result, {
        status: "externally_confirmed",
        actorType: "verifier",
        evidenceRef: { field_confirmation_id: claim.verification.id },
      });
    }
  }

  const { result: thirdPartyRow } = await ensureDimensionRow(serviceClient, claim.verification.user_id, claim.verification.portfolio_item_id, THIRD_PARTY_CONFIRMATION_DIMENSION);
  if (thirdPartyRow) {
    await applyDimensionTransition(serviceClient, thirdPartyRow, {
      status: anyConfirmed ? "externally_confirmed" : "needs_review",
      actorType: "verifier",
      reason: anyUnresolved ? "The verifier could not confirm every requested detail." : undefined,
    });
  }

  const confirmedCount = submissions.filter((s) => s.response === "can_confirm").length;
  await runFieldConfirmationScopeCheck(claim.verification.user_id, confirmedCount, VERIFICATION_FIELD_OPTIONS.length);

  revalidatePath(`/portfolio/items/${claim.verification.portfolio_item_id}`);
  return {};
}

// --- Reviewer actions (authenticated, allowlisted) --------------------------

export async function getReviewQueueForReviewer(): Promise<{ entries: ReviewQueueEntry[]; error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user || !(await isAuthorizedReviewerAsync(user.id, user.email))) return { entries: [], error: "Not authorized." };

  const clientResult = getServiceRoleClientOrError();
  if ("error" in clientResult) return { entries: [], error: clientResult.error };
  const entries = await repo.listReviewQueue(clientResult.client);
  return { entries };
}

export async function reviewerDecide(verificationId: string, decision: "confirm" | "reject", notes: string): Promise<VerificationActionResult> {
  const user = await getAuthenticatedUser();
  if (!user || !(await isAuthorizedReviewerAsync(user.id, user.email))) return { error: "Not authorized." };

  const notesError = validateReviewNotes(notes);
  if (notesError) return { error: notesError };
  if (containsForbiddenLanguage(notes)) {
    return { error: "Please describe what's missing or mismatched without characterizing the student." };
  }

  const supabase = await createClient();
  const rateLimit = await checkAndIncrementRateLimit(supabase, "reviewer_decision");
  if (!rateLimit.allowed) return { error: "You've reached the limit for this request type — try again later." };

  const clientResult = getServiceRoleClientOrError();
  if ("error" in clientResult) return { error: clientResult.error };
  const serviceClient = clientResult.client;
  const { data: verification, error: fetchError } = await serviceClient
    .from("portfolio_verifications")
    .select("*")
    .eq("id", verificationId)
    .maybeSingle();
  if (fetchError || !verification) return { error: "Couldn't find that verification record." };

  if (hasConflictOfInterest(user.id, verification.user_id)) {
    return { error: "You can't review your own entry." };
  }

  const newLevel: PortfolioVerificationLevel = decision === "confirm" ? "externally_confirmed" : "rejected";
  if (!canTransitionLevel(verification.verification_level, newLevel, "reviewer")) {
    return { error: "That decision isn't available for this item." };
  }

  const { error: updateError } = await repo.updateVerificationAsServiceRole(serviceClient, verificationId, {
    verification_level: newLevel,
    verification_method: "manual_review",
    review_notes: notes.trim() || null,
    verified_at: decision === "confirm" ? new Date().toISOString() : verification.verified_at,
  });
  if (updateError) {
    console.error("[verification] failed to save reviewer decision:", updateError);
    return { error: "Couldn't save that decision. Please try again." };
  }

  await repo.insertVerificationEventAsServiceRole(serviceClient, {
    user_id: verification.user_id,
    portfolio_item_id: verification.portfolio_item_id,
    verification_id: verification.id,
    event_type: "reviewer_decision",
    actor_type: "reviewer",
    previous_level: verification.verification_level,
    new_level: newLevel,
    reason: notes.trim() || null,
  });

  revalidatePath(`/portfolio/items/${verification.portfolio_item_id}`);
  revalidatePath("/portfolio/review");
  return {};
}

/**
 * Verification-request-flow logic (spec section 4) — duplicate/cooldown/
 * consent/self-email/disposable-email rules, plus deriving the student-
 * facing request status from the columns the migration actually has
 * (there's no separate `request_status` column — see the migration's
 * comment on `metadata`). Pure and dependency-free.
 */

import { DISPOSABLE_EMAIL_DOMAINS, MAX_RESENDS_PER_REQUEST, RESEND_COOLDOWN_SECONDS } from "@/lib/verification/constants";
import { isTokenExpired } from "@/lib/verification/tokens";
import type { PortfolioVerificationLevel } from "@/types/database";
import type { PortfolioVerificationMetadata } from "@/types/verification";

export type RequestStatus = "not_requested" | "pending" | "confirmed" | "declined" | "expired" | "cancelled";

export type RequestStatusInput = {
  requestedAt: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
  verificationLevel: PortfolioVerificationLevel;
  metadata: PortfolioVerificationMetadata;
};

/** Order matters: a cancellation or decline is a terminal fact about *that* request, checked before falling through to a live pending/expired read. */
export function deriveRequestStatus(input: RequestStatusInput, now: Date = new Date()): RequestStatus {
  if (input.requestedAt === null) return "not_requested";
  if (input.metadata.cancelled_at) return "cancelled";
  if (input.metadata.declined_at) return "declined";
  if (input.verificationLevel === "externally_confirmed" && input.verifiedAt !== null) return "confirmed";
  if (isTokenExpired(input.expiresAt, now)) return "expired";
  return "pending";
}

/** A brand-new request may only be started when nothing is currently in flight — the same active row is reused (updated in place) rather than a second one ever being created. */
export function canStartNewRequest(currentStatus: RequestStatus): boolean {
  return currentStatus !== "pending";
}

export function validateConsent(consentGiven: boolean): string | null {
  return consentGiven ? null : "Confirm you understand what will be shared before sending a verification request.";
}

/** A verifier is only useful if they aren't the student themself. */
export function isSelfVerification(verifierEmail: string, studentEmail: string): boolean {
  return verifierEmail.trim().toLowerCase() === studentEmail.trim().toLowerCase();
}

export function looksDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at === -1) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return DISPOSABLE_EMAIL_DOMAINS.includes(domain);
}

export type RequestEligibility = { allowed: true } | { allowed: false; error: string };

/** The full pre-flight gate a request must clear before a token is ever generated or an email ever sent — every rule the spec lists under "Prevent," run in one place so actions.ts can't accidentally skip one. */
export function checkRequestEligibility(input: {
  currentStatus: RequestStatus;
  consentGiven: boolean;
  verifierEmail: string;
  studentEmail: string;
}): RequestEligibility {
  if (!canStartNewRequest(input.currentStatus)) {
    return { allowed: false, error: "A verification request is already pending for this item." };
  }
  const consentError = validateConsent(input.consentGiven);
  if (consentError) return { allowed: false, error: consentError };

  if (isSelfVerification(input.verifierEmail, input.studentEmail)) {
    return { allowed: false, error: "The verifier's email can't be your own." };
  }
  if (looksDisposableEmail(input.verifierEmail)) {
    return { allowed: false, error: "That looks like a temporary/disposable email address — use the verifier's real contact." };
  }
  return { allowed: true };
}

export type ResendEligibility = { allowed: true } | { allowed: false; error: string; retryAfterSeconds?: number };

export function checkResendEligibility(input: { resendCount: number; lastSentAt: string | null }, now: Date = new Date()): ResendEligibility {
  if (input.resendCount >= MAX_RESENDS_PER_REQUEST) {
    return { allowed: false, error: "This request has already been resent the maximum number of times — cancel it and send a new one instead." };
  }
  if (input.lastSentAt !== null) {
    const elapsedSeconds = (now.getTime() - new Date(input.lastSentAt).getTime()) / 1000;
    if (elapsedSeconds < RESEND_COOLDOWN_SECONDS) {
      return { allowed: false, error: "Give it a bit longer before resending.", retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_SECONDS - elapsedSeconds) };
    }
  }
  return { allowed: true };
}

/**
 * Dependency-free field validation for the verification layer — no
 * Supabase import, unit-testable without mocking anything. Mirrors the
 * migration's own check constraints; both must be kept in sync by hand
 * (same convention as portfolio/validation.ts).
 */

import {
  MAX_CORRECTION_NOTE_LENGTH,
  MAX_EVIDENCE_URL_LENGTH,
  MAX_REVIEW_NOTES_LENGTH,
  MAX_VERIFIER_NAME_LENGTH,
  MAX_VERIFIER_ORGANIZATION_LENGTH,
} from "@/lib/verification/constants";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function validateVerifierName(name: string | null): string | null {
  if (name === null || name.trim().length === 0) return "Enter the verifier's name.";
  if (name.length > MAX_VERIFIER_NAME_LENGTH) return "That name is too long.";
  return null;
}

export function validateVerifierEmail(email: string | null): string | null {
  if (email === null || email.trim().length === 0) return "Enter the verifier's email address.";
  if (email.length > 320) return "That email address is too long.";
  if (!EMAIL_PATTERN.test(email.trim())) return "That doesn't look like a valid email address.";
  return null;
}

export function validateVerifierOrganization(organization: string | null): string | null {
  if (organization !== null && organization.length > MAX_VERIFIER_ORGANIZATION_LENGTH) {
    return "Organization name is too long.";
  }
  return null;
}

export function validateReviewNotes(notes: string | null): string | null {
  if (notes !== null && notes.length > MAX_REVIEW_NOTES_LENGTH) return "Review notes are too long.";
  return null;
}

export function validateCorrectionNote(note: string | null): string | null {
  if (note !== null && note.length > MAX_CORRECTION_NOTE_LENGTH) return "That note is too long.";
  return null;
}

export function validateEvidenceUrl(url: string | null): string | null {
  if (url === null || url.trim().length === 0) return "Enter a URL.";
  if (url.length > MAX_EVIDENCE_URL_LENGTH) return "That link is too long.";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "That doesn't look like a valid link.";
  }
  if (parsed.protocol !== "https:") return "Official links must use https://.";
  return null;
}

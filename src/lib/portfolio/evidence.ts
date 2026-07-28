/**
 * Dependency-free evidence-link mutation logic — same split as item.ts.
 * Identity always comes from an already-resolved session user id; the
 * plan/item ownership cross-checks themselves live in the migration's RLS
 * policies (defense-in-depth) and are re-verified in repository.ts before
 * any write.
 */

import { validateEvidenceNotes } from "@/lib/portfolio/validation";
import type { EvidencePurpose } from "@/types/database";

export type EvidenceMutationResult = { success: true } | { success: false; error: string };
export type EvidenceAttachResult = { success: true; linkId: string } | { success: false; error: string };

export type AttachEvidenceInput = {
  applicationPlanId: string;
  portfolioItemId: string;
  evidencePurpose: EvidencePurpose;
  notes?: string | null;
};

export type AttachEvidenceFn = (
  userId: string,
  input: AttachEvidenceInput
) => Promise<{ linkId: string | null; error: string | null }>;

/**
 * Attaching the same (application, item, purpose) combination twice is
 * never an error — it's treated as "already attached," same idempotent
 * spirit as createOrReuseApplicationPlan. The actual dedupe happens in
 * repository.ts (select-then-insert, with the migration's unique
 * constraint as the race-safety backstop); this function only owns
 * validation and the friendly-error boundary.
 */
export async function attachEvidenceForUser(
  userId: string | null,
  input: AttachEvidenceInput,
  attach: AttachEvidenceFn
): Promise<EvidenceAttachResult> {
  if (userId === null) {
    return { success: false, error: "You need to be signed in to attach evidence." };
  }

  const notesError = validateEvidenceNotes(input.notes ?? null);
  if (notesError) return { success: false, error: notesError };

  const { linkId, error } = await attach(userId, input);
  if (error || linkId === null) {
    console.error("[portfolio] failed to attach evidence:", error);
    return { success: false, error: "Couldn't attach that evidence. Please try again." };
  }

  return { success: true, linkId };
}

export type DetachEvidenceFn = (userId: string, linkId: string) => Promise<{ error: string | null }>;

export async function detachEvidenceForUser(
  userId: string | null,
  linkId: string,
  detach: DetachEvidenceFn
): Promise<EvidenceMutationResult> {
  if (userId === null) {
    return { success: false, error: "You need to be signed in to remove evidence." };
  }

  const { error } = await detach(userId, linkId);
  if (error) {
    console.error("[portfolio] failed to detach evidence:", error);
    return { success: false, error: "Couldn't remove that evidence. Please try again." };
  }

  return { success: true };
}

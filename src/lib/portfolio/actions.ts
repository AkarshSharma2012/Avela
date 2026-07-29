"use server";

import { revalidatePath } from "next/cache";

import { getApplicationPlan } from "@/lib/applications/repository";
import { getAuthenticatedUser } from "@/lib/auth/dal";
import { invalidateDimensionsForMaterialEdit } from "@/lib/claims/invalidation";
import { applyFieldPatchToSnapshot, classifyEdit, computeMaterialHash, snapshotFromItem } from "@/lib/claims/material-hash";
import { applyDimensionTransition, ensureDimensionRow, listDimensionsForUser, markDimensionStale, studentUpdateDimension } from "@/lib/claims/repository";
import { generatePossessionChallenge } from "@/lib/identity/possession-challenge";
import { runNearIdenticalNarrativeCheck } from "@/lib/integrity/orchestrator";
import { checkAndIncrementRateLimit } from "@/lib/integrity/rate-limit";
import { PORTFOLIO_SIGNED_URL_EXPIRY_SECONDS } from "@/lib/portfolio/constants";
import { attachEvidenceForUser, detachEvidenceForUser, type AttachEvidenceInput } from "@/lib/portfolio/evidence";
import * as evidenceRepo from "@/lib/portfolio/evidence-repository";
import {
  createPortfolioItemForUser,
  deletePortfolioItemForUser,
  setPortfolioItemVisibilityForUser,
  updatePortfolioItemForUser,
  type PortfolioItemFields,
  type UpdatePortfolioItemInput,
} from "@/lib/portfolio/item";
import { validateEntryNarrativeInput, type EntryNarrativeInput } from "@/lib/portfolio/entry-narrative";
import { buildInternalNarrative, validatePersonalProjectInput, type PersonalProjectInput } from "@/lib/portfolio/personal-project";
import * as repo from "@/lib/portfolio/repository";
import { hasConflictOfInterest, isAuthorizedReviewerAsync } from "@/lib/roles/access";
import { createVerificationServiceRoleClient } from "@/lib/verification/repository";
import { createClient } from "@/lib/supabase/server";
import type { PortfolioItemVisibility } from "@/types/database";
import type { PortfolioItem } from "@/types/portfolio";

export type PortfolioActionResult = { error?: string };
export type CreateItemResult = { itemId?: string; error?: string };
export type AttachEvidenceResult = { linkId?: string; error?: string };
export type SignedUrlResult = { url?: string; error?: string };

function revalidatePortfolioPages(itemId?: string) {
  revalidatePath("/portfolio");
  revalidatePath("/dashboard");
  if (itemId) revalidatePath(`/portfolio/items/${itemId}`);
}

/**
 * `narrative` is optional so every existing caller (the pre-Milestone-10.8
 * long-form item creation path) keeps working unchanged — only the new
 * low-friction flow (spec section 3) supplies it. When present, an invalid
 * narrative fails the whole create rather than saving an item with a
 * half-written required answer.
 */
export async function createPortfolioItem(input: PortfolioItemFields, narrative?: EntryNarrativeInput): Promise<CreateItemResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in to add a portfolio item." };

  if (narrative) {
    const narrativeCheck = validateEntryNarrativeInput(narrative);
    if (!narrativeCheck.valid) return { error: narrativeCheck.error };
  }

  const supabase = await createClient();
  const result = await createPortfolioItemForUser(user.id, input, (userId, fields) =>
    repo.insertPortfolioItem(supabase, userId, fields)
  );

  if (!result.success) return { error: result.error };

  if (narrative && result.itemId) {
    await repo.upsertEntryNarrative(supabase, {
      user_id: user.id,
      portfolio_item_id: result.itemId,
      what_you_did: narrative.whatYouDid,
      why_you_did_it: narrative.whyYouDidIt,
      your_part: narrative.yourPart,
      who_it_helped: narrative.whoItHelped ?? null,
      materials_or_tools: narrative.materialsOrTools ?? null,
      collaborators: narrative.collaborators ?? null,
      challenges: narrative.challenges ?? null,
      result: narrative.result ?? null,
      what_you_learned: narrative.whatYouLearned ?? null,
      would_improve: narrative.wouldImprove ?? null,
    });
  }

  revalidatePortfolioPages(result.itemId);
  return { itemId: result.itemId };
}

export async function updatePortfolioItem(itemId: string, input: UpdatePortfolioItemInput): Promise<PortfolioActionResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in to edit this item." };

  const supabase = await createClient();
  const existing = await repo.getPortfolioItem(supabase, user.id, itemId);
  if (!existing) return { error: "Couldn't find that item." };

  const result = await updatePortfolioItemForUser(user.id, itemId, input, (userId, id, patch) =>
    repo.writePortfolioItemUpdate(supabase, userId, id, patch)
  );

  if (!result.success) return { error: result.error };

  await applyMaterialEditInvalidation(user.id, existing, input);

  revalidatePortfolioPages(itemId);
  return {};
}

/**
 * Spec section 8: verification applies to the exact version of a claim
 * that was reviewed. Compares the item's last known material snapshot to
 * what it looks like after this save, and — only for genuinely material
 * changes, never cosmetic ones — stales/downgrades just the dependent
 * claim dimensions, explaining which field changed. The very first save
 * after this migration (last_material_hash still null) only seeds the
 * hash; there's nothing yet to compare it against.
 */
async function applyMaterialEditInvalidation(userId: string, existing: PortfolioItem, input: UpdatePortfolioItemInput): Promise<void> {
  const supabase = await createClient();

  const previousSnapshot = snapshotFromItem(existing);
  const nextSnapshot = applyFieldPatchToSnapshot(previousSnapshot, {
    title: input.title,
    organization: input.organization,
    role: input.role,
    startDate: input.startDate,
    endDate: input.endDate,
    description: input.description,
    outcome: input.outcome,
    hoursPerWeek: input.hoursPerWeek,
    weeksPerYear: input.weeksPerYear,
    url: input.url,
  });
  const newHash = await computeMaterialHash(nextSnapshot);

  if (existing.last_material_hash) {
    const { isMaterial, changedFields } = classifyEdit(previousSnapshot, nextSnapshot);
    if (isMaterial) {
      try {
        const serviceClient = createVerificationServiceRoleClient();
        await invalidateDimensionsForMaterialEdit(serviceClient, userId, existing.id, changedFields);
      } catch (err) {
        console.error("[portfolio] failed to invalidate claim dimensions after a material edit:", err);
      }
    }
  }

  await supabase
    .from("portfolio_items")
    .update({ last_material_hash: newHash, material_hash_updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", existing.id);
}

export async function setPortfolioItemVisibility(
  itemId: string,
  visibility: PortfolioItemVisibility
): Promise<PortfolioActionResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in to update this item." };

  const supabase = await createClient();
  const result = await setPortfolioItemVisibilityForUser(user.id, itemId, visibility, (userId, id, value) =>
    repo.writePortfolioItemVisibility(supabase, userId, id, value)
  );

  if (!result.success) return { error: result.error };
  revalidatePortfolioPages(itemId);
  return {};
}

/**
 * Storage objects are removed *before* the DB row. The migration's
 * `on delete cascade` from portfolio_items to portfolio_files cleans up
 * the *rows*, but a Postgres cascade has no reach into Supabase Storage —
 * without this, a deleted item would leave its files behind in the bucket
 * with no row (and therefore no owner-scoped way to find or remove them
 * again later). If the DB delete itself then fails, nothing was lost that
 * the student can't still see: the item and its files remain exactly as
 * they were.
 */
export async function deletePortfolioItem(itemId: string): Promise<PortfolioActionResult> {
  const user = await getAuthenticatedUser();
  const supabase = await createClient();

  if (user) {
    const files = await repo.listFilesForItem(supabase, user.id, itemId);
    if (files.length > 0) {
      await repo.removePortfolioStorageObjects(
        supabase,
        files.map((file) => file.storage_path)
      );
    }
  }

  const result = await deletePortfolioItemForUser(user?.id ?? null, itemId, (userId, id) =>
    repo.removePortfolioItem(supabase, userId, id)
  );

  if (!result.success) return { error: result.error };
  revalidatePortfolioPages();
  return {};
}

export async function deletePortfolioFile(fileId: string): Promise<PortfolioActionResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in to remove this file." };

  const supabase = await createClient();
  const file = await repo.getPortfolioFile(supabase, user.id, fileId);
  if (!file) return { error: "Couldn't find that file." };

  const { error: storageError } = await repo.removePortfolioStorageObjects(supabase, [file.storage_path]);
  if (storageError) {
    console.error("[portfolio] failed to remove storage object:", storageError);
    return { error: "Couldn't remove that file. Please try again." };
  }

  const { error } = await repo.removePortfolioFileRow(supabase, user.id, fileId);
  if (error) {
    console.error("[portfolio] failed to remove portfolio file row:", error);
    return { error: "Couldn't remove that file. Please try again." };
  }

  // Spec section 8: deleting evidence removes any dependent claim-dimension
  // support — never silently keeping a "strongly supported" badge that was
  // only ever backed by the now-gone file. Audit history stays intact
  // regardless (claim_dimension_events has no delete/update policy).
  if (file.portfolio_item_id) {
    await downgradeDimensionsForDeletedEvidence(user.id, file.portfolio_item_id, fileId);
  }

  revalidatePortfolioPages(file.portfolio_item_id ?? undefined);
  return {};
}

async function downgradeDimensionsForDeletedEvidence(userId: string, itemId: string, fileId: string): Promise<void> {
  const supabase = await createClient();
  const byItem = await listDimensionsForUser(supabase, userId);
  const affected = (byItem.get(itemId) ?? []).filter((row) => {
    const ref = row.evidence_ref as { evidence_file_id?: string } | null;
    return ref?.evidence_file_id === fileId;
  });
  if (affected.length === 0) return;

  try {
    const serviceClient = createVerificationServiceRoleClient();
    for (const row of affected) {
      await markDimensionStale(serviceClient, row, "Supporting evidence for this was removed.");
    }
  } catch (err) {
    console.error("[portfolio] failed to downgrade dimensions after evidence deletion:", err);
  }
}

/** A fresh, short-lived signed URL — never a stored/reusable one. Called on demand (e.g. a "View" or "Download" click), not baked into any page render, so a link never sits around longer than it has to. */
export async function getPortfolioFileDownloadUrl(fileId: string): Promise<SignedUrlResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in to view this file." };

  const supabase = await createClient();
  const file = await repo.getPortfolioFile(supabase, user.id, fileId);
  if (!file) return { error: "Couldn't find that file." };

  const { url, error } = await repo.createPortfolioFileSignedUrl(supabase, file.storage_path, PORTFOLIO_SIGNED_URL_EXPIRY_SECONDS);
  if (error || !url) {
    console.error("[portfolio] failed to create signed url:", error);
    return { error: "Couldn't create a download link. Please try again." };
  }
  return { url };
}

/** Verifies the application plan and the portfolio item are both owned by the caller before ever reaching the database write — defense-in-depth on top of the migration's own cross-owner RLS checks (see the migration's insert policy on application_evidence_links). */
export async function attachEvidence(input: AttachEvidenceInput): Promise<AttachEvidenceResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in to attach evidence." };

  const supabase = await createClient();
  const [plan, item] = await Promise.all([
    getApplicationPlan(supabase, user.id, input.applicationPlanId),
    repo.getPortfolioItem(supabase, user.id, input.portfolioItemId),
  ]);
  if (!plan) return { error: "Couldn't find that application." };
  if (!item) return { error: "Couldn't find that portfolio item." };

  const result = await attachEvidenceForUser(user.id, input, (userId, attachInput) =>
    evidenceRepo.attachEvidenceLink(supabase, userId, attachInput)
  );

  if (!result.success) return { error: result.error };

  revalidatePath(`/applications/${input.applicationPlanId}`);
  revalidatePath("/applications");
  revalidatePortfolioPages(input.portfolioItemId);
  return { linkId: result.linkId };
}

export async function detachEvidence(linkId: string, applicationPlanId?: string): Promise<PortfolioActionResult> {
  const user = await getAuthenticatedUser();
  const supabase = await createClient();

  const result = await detachEvidenceForUser(user?.id ?? null, linkId, (userId, id) =>
    evidenceRepo.removeEvidenceLink(supabase, userId, id)
  );

  if (!result.success) return { error: result.error };

  if (applicationPlanId) revalidatePath(`/applications/${applicationPlanId}`);
  revalidatePath("/applications");
  revalidatePortfolioPages();
  return {};
}

// --- Personal/physical/creative project flow (Milestone 10.7) -------------

export async function savePersonalProjectDetails(itemId: string, input: PersonalProjectInput): Promise<PortfolioActionResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in." };

  const validation = validatePersonalProjectInput(input);
  if (!validation.valid) return { error: validation.error };

  const supabase = await createClient();
  const item = await repo.getPortfolioItem(supabase, user.id, itemId);
  if (!item) return { error: "Couldn't find that portfolio item." };

  const { error } = await repo.upsertPersonalProjectDetails(supabase, {
    user_id: user.id,
    portfolio_item_id: itemId,
    what_you_made: input.whatYouMade.trim(),
    why_you_made_it: input.whyYouMadeIt.trim(),
    your_part: input.yourPart.trim(),
    made_for: input.madeFor?.trim() || null,
    problem_or_goal: input.problemOrGoal?.trim() || null,
    tools_or_materials: input.toolsOrMaterials?.trim() || null,
    difficult_or_interesting: input.difficultOrInteresting?.trim() || null,
    result: input.result?.trim() || null,
    improvement_ideas: input.improvementIdeas?.trim() || null,
    collaborators: input.collaborators?.trim() || null,
  });
  if (error) {
    console.error("[portfolio] failed to save personal project details:", error);
    return { error: "Couldn't save that. Please try again." };
  }

  const dimensionRow = await ensureDimensionRow(supabase, user.id, itemId, "authorship_or_contribution");
  if (dimensionRow.result) {
    await studentUpdateDimension(supabase, user.id, dimensionRow.result, {
      evidenceRef: { field_confirmation_id: itemId } as unknown as Record<string, unknown>,
    });
  }

  await checkNarrativeSimilarityAcrossItems(user.id, itemId, input);

  revalidatePortfolioPages(itemId);
  return {};
}

/** Spec section 9: "splitting one project into many entries" / "many nearly identical verified entries" — best-effort, never blocking the save. */
async function checkNarrativeSimilarityAcrossItems(userId: string, itemId: string, input: PersonalProjectInput): Promise<void> {
  try {
    const supabase = await createClient();
    const items = await repo.listPortfolioItems(supabase, userId, { includeArchived: true });
    const others = await Promise.all(
      items
        .filter((item) => item.id !== itemId)
        .map(async (item) => ({ itemId: item.id, details: await repo.getPersonalProjectDetails(supabase, userId, item.id) }))
    );
    const narrativesByItem = [
      { itemId, narrative: buildInternalNarrative(input) },
      ...others
        .filter((entry): entry is { itemId: string; details: NonNullable<typeof entry.details> } => Boolean(entry.details))
        .map((entry) => ({
          itemId: entry.itemId,
          narrative: buildInternalNarrative({
            whatYouMade: entry.details.what_you_made,
            whyYouMadeIt: entry.details.why_you_made_it,
            yourPart: entry.details.your_part,
            madeFor: entry.details.made_for,
            problemOrGoal: entry.details.problem_or_goal,
            toolsOrMaterials: entry.details.tools_or_materials,
            difficultOrInteresting: entry.details.difficult_or_interesting,
            result: entry.details.result,
            improvementIdeas: entry.details.improvement_ideas,
            collaborators: entry.details.collaborators,
          }),
        })),
    ];
    await runNearIdenticalNarrativeCheck(userId, narrativesByItem);
  } catch (err) {
    console.error("[portfolio] failed to run narrative-similarity check:", err);
  }
}

export type RequestPossessionChallengeResult = { rawToken?: string; challengeId?: string; expiresAt?: string; error?: string };

/** Rate-limited (spec section 9) — never blocks portfolio creation, only this optional extra step. */
export async function requestPhysicalPossessionChallenge(itemId: string): Promise<RequestPossessionChallengeResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in." };

  const supabase = await createClient();
  const item = await repo.getPortfolioItem(supabase, user.id, itemId);
  if (!item) return { error: "Couldn't find that portfolio item." };

  const rateLimit = await checkAndIncrementRateLimit(supabase, "possession_challenge");
  if (!rateLimit.allowed) return { error: "You've reached the limit for this request type — try again later." };

  const { rawToken, tokenHash, expiresAt } = generatePossessionChallenge();
  const { challenge, error } = await repo.createPossessionChallenge(supabase, {
    user_id: user.id,
    portfolio_item_id: itemId,
    challenge_token_hash: tokenHash,
    expires_at: expiresAt,
  });
  if (error || !challenge) return { error: "Couldn't start that check right now. Please try again." };

  return { rawToken, challengeId: challenge.id, expiresAt };
}

/** Attaching the photo is the student's part; confirming it (visually checking the code is present) always requires a reviewer — see reviewerConfirmPossessionChallenge below. */
export async function attachPossessionChallengeEvidence(challengeId: string, fileId: string): Promise<PortfolioActionResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in." };

  const supabase = await createClient();
  const [challenge, file] = await Promise.all([repo.getPossessionChallenge(supabase, user.id, challengeId), repo.getPortfolioFile(supabase, user.id, fileId)]);
  if (!challenge || challenge.status !== "pending") return { error: "This check is no longer available." };
  if (!file) return { error: "Couldn't find that file." };

  const { error } = await repo.attachPossessionChallengeEvidence(supabase, user.id, challengeId, fileId);
  if (error) return { error: "Couldn't save that. Please try again." };

  revalidatePortfolioPages(challenge.portfolio_item_id);
  return {};
}

/** Reviewer-only — no OCR/vision connector exists to auto-read the code from a photo, so this is always a respectful human step, never automatic (see docs/security.md). */
export async function reviewerConfirmPossessionChallenge(challengeId: string): Promise<PortfolioActionResult> {
  const user = await getAuthenticatedUser();
  if (!user || !(await isAuthorizedReviewerAsync(user.id, user.email))) return { error: "Not authorized." };

  const supabase = await createClient();
  const rateLimit = await checkAndIncrementRateLimit(supabase, "reviewer_decision");
  if (!rateLimit.allowed) return { error: "You've reached the limit for this request type — try again later." };

  let serviceClient: ReturnType<typeof createVerificationServiceRoleClient>;
  try {
    serviceClient = createVerificationServiceRoleClient();
  } catch (err) {
    console.error("[portfolio] service-role client unavailable:", err);
    return { error: "This action isn't available right now. Please try again later." };
  }

  const { data: challenge, error: fetchError } = await serviceClient.from("portfolio_possession_challenges").select("*").eq("id", challengeId).maybeSingle();
  if (fetchError || !challenge) return { error: "Couldn't find that check." };
  if (hasConflictOfInterest(user.id, challenge.user_id)) return { error: "You can't review your own entry." };
  if (challenge.status !== "pending" || !challenge.evidence_file_id) {
    return { error: "This check needs a photo attached before it can be confirmed." };
  }

  const { error } = await repo.confirmPossessionChallengeAsServiceRole(serviceClient, challengeId);
  if (error) return { error: "Couldn't save that decision. Please try again." };

  const dimensionRow = await ensureDimensionRow(serviceClient, challenge.user_id, challenge.portfolio_item_id, "account_or_asset_control");
  if (dimensionRow.result) {
    await applyDimensionTransition(serviceClient, dimensionRow.result, {
      status: "strongly_supported",
      actorType: "reviewer",
      reason: "A reviewer confirmed the possession code was visible in the attached photo.",
      evidenceRef: { field_confirmation_id: challengeId },
    });
  }

  revalidatePath(`/portfolio/items/${challenge.portfolio_item_id}`);
  revalidatePath("/portfolio/review");
  return {};
}

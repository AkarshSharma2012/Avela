"use server";

import { revalidatePath } from "next/cache";

import { getApplicationPlan } from "@/lib/applications/repository";
import { getAuthenticatedUser } from "@/lib/auth/dal";
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
import * as repo from "@/lib/portfolio/repository";
import { createClient } from "@/lib/supabase/server";
import type { PortfolioItemVisibility } from "@/types/database";

export type PortfolioActionResult = { error?: string };
export type CreateItemResult = { itemId?: string; error?: string };
export type AttachEvidenceResult = { linkId?: string; error?: string };
export type SignedUrlResult = { url?: string; error?: string };

function revalidatePortfolioPages(itemId?: string) {
  revalidatePath("/portfolio");
  revalidatePath("/dashboard");
  if (itemId) revalidatePath(`/portfolio/items/${itemId}`);
}

export async function createPortfolioItem(input: PortfolioItemFields): Promise<CreateItemResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "You need to be signed in to add a portfolio item." };

  const supabase = await createClient();
  const result = await createPortfolioItemForUser(user.id, input, (userId, fields) =>
    repo.insertPortfolioItem(supabase, userId, fields)
  );

  if (!result.success) return { error: result.error };
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
  revalidatePortfolioPages(itemId);
  return {};
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

  revalidatePortfolioPages(file.portfolio_item_id ?? undefined);
  return {};
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

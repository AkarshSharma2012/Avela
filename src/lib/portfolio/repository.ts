import type { SupabaseClient } from "@supabase/supabase-js";

import { STUDENT_PORTFOLIO_BUCKET } from "@/lib/portfolio/constants";
import type { PortfolioItemFields, UpdatePortfolioItemInput } from "@/lib/portfolio/item";
import type { Database } from "@/types/database";
import type { PortfolioFile, PortfolioItem, PortfolioItemWithFiles } from "@/types/portfolio";

type Client = SupabaseClient<Database>;

// --- Items ----------------------------------------------------------------

export async function listPortfolioItems(
  supabase: Client,
  userId: string,
  options: { includeArchived?: boolean } = {}
): Promise<PortfolioItem[]> {
  let query = supabase.from("portfolio_items").select("*").eq("user_id", userId);
  if (!options.includeArchived) {
    query = query.eq("visibility", "visible");
  }
  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("[portfolio] failed to load portfolio items:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getPortfolioItem(supabase: Client, userId: string, itemId: string): Promise<PortfolioItem | null> {
  const { data, error } = await supabase
    .from("portfolio_items")
    .select("*")
    .eq("user_id", userId)
    .eq("id", itemId)
    .maybeSingle();

  if (error) {
    console.error("[portfolio] failed to load portfolio item:", error.message);
    return null;
  }
  return data;
}

function toItemInsert(userId: string, input: PortfolioItemFields): Database["public"]["Tables"]["portfolio_items"]["Insert"] {
  return {
    user_id: userId,
    item_type: input.itemType,
    title: input.title,
    organization: input.organization ?? null,
    description: input.description ?? null,
    start_date: input.startDate ?? null,
    end_date: input.endDate ?? null,
    is_current: input.isCurrent ?? false,
    hours_per_week: input.hoursPerWeek ?? null,
    weeks_per_year: input.weeksPerYear ?? null,
    role: input.role ?? null,
    outcome: input.outcome ?? null,
    skills: input.skills ?? [],
    tags: input.tags ?? [],
    url: input.url ?? null,
    github_username: input.githubUsername ?? null,
  };
}

export async function insertPortfolioItem(
  supabase: Client,
  userId: string,
  input: PortfolioItemFields
): Promise<{ itemId: string | null; error: string | null }> {
  const { data, error } = await supabase.from("portfolio_items").insert(toItemInsert(userId, input)).select("id").single();

  if (error) return { itemId: null, error: error.message };
  return { itemId: data.id, error: null };
}

function toItemUpdate(patch: UpdatePortfolioItemInput): Database["public"]["Tables"]["portfolio_items"]["Update"] {
  const update: Database["public"]["Tables"]["portfolio_items"]["Update"] = {};
  if (patch.itemType !== undefined) update.item_type = patch.itemType;
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.organization !== undefined) update.organization = patch.organization;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.startDate !== undefined) update.start_date = patch.startDate;
  if (patch.endDate !== undefined) update.end_date = patch.endDate;
  if (patch.isCurrent !== undefined) update.is_current = patch.isCurrent;
  if (patch.hoursPerWeek !== undefined) update.hours_per_week = patch.hoursPerWeek;
  if (patch.weeksPerYear !== undefined) update.weeks_per_year = patch.weeksPerYear;
  if (patch.role !== undefined) update.role = patch.role;
  if (patch.outcome !== undefined) update.outcome = patch.outcome;
  if (patch.skills !== undefined) update.skills = patch.skills;
  if (patch.tags !== undefined) update.tags = patch.tags;
  if (patch.url !== undefined) update.url = patch.url;
  if (patch.githubUsername !== undefined) update.github_username = patch.githubUsername;
  if (patch.visibility !== undefined) update.visibility = patch.visibility;
  return update;
}

export async function writePortfolioItemUpdate(
  supabase: Client,
  userId: string,
  itemId: string,
  patch: UpdatePortfolioItemInput
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("portfolio_items").update(toItemUpdate(patch)).eq("user_id", userId).eq("id", itemId);
  return { error: error?.message ?? null };
}

export async function writePortfolioItemVisibility(
  supabase: Client,
  userId: string,
  itemId: string,
  visibility: Database["public"]["Tables"]["portfolio_items"]["Row"]["visibility"]
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("portfolio_items").update({ visibility }).eq("user_id", userId).eq("id", itemId);
  return { error: error?.message ?? null };
}

export async function removePortfolioItem(supabase: Client, userId: string, itemId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("portfolio_items").delete().eq("user_id", userId).eq("id", itemId);
  return { error: error?.message ?? null };
}

// --- Files ------------------------------------------------------------------

export async function listFilesForItem(supabase: Client, userId: string, itemId: string): Promise<PortfolioFile[]> {
  const { data, error } = await supabase
    .from("portfolio_files")
    .select("*")
    .eq("user_id", userId)
    .eq("portfolio_item_id", itemId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[portfolio] failed to load item files:", error.message);
    return [];
  }
  return data ?? [];
}

/** Every file row a student has, across every item — used for the profile-strength "proof attached" signal without one query per item. */
export async function listAllFilesForUser(supabase: Client, userId: string): Promise<PortfolioFile[]> {
  const { data, error } = await supabase.from("portfolio_files").select("*").eq("user_id", userId);

  if (error) {
    console.error("[portfolio] failed to load portfolio files:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getPortfolioFile(supabase: Client, userId: string, fileId: string): Promise<PortfolioFile | null> {
  const { data, error } = await supabase
    .from("portfolio_files")
    .select("*")
    .eq("user_id", userId)
    .eq("id", fileId)
    .maybeSingle();

  if (error) {
    console.error("[portfolio] failed to load portfolio file:", error.message);
    return null;
  }
  return data;
}

export type InsertFileMeta = {
  portfolioItemId: string | null;
  storagePath: string;
  originalFilename: string;
  mimeType: Database["public"]["Tables"]["portfolio_files"]["Row"]["mime_type"];
  fileSize: number;
  label?: string | null;
};

export async function insertPortfolioFileRow(
  supabase: Client,
  userId: string,
  meta: InsertFileMeta
): Promise<{ fileId: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from("portfolio_files")
    .insert({
      user_id: userId,
      portfolio_item_id: meta.portfolioItemId,
      storage_path: meta.storagePath,
      original_filename: meta.originalFilename,
      mime_type: meta.mimeType,
      file_size: meta.fileSize,
      label: meta.label ?? null,
    })
    .select("id")
    .single();

  if (error) return { fileId: null, error: error.message };
  return { fileId: data.id, error: null };
}

export async function removePortfolioFileRow(supabase: Client, userId: string, fileId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("portfolio_files").delete().eq("user_id", userId).eq("id", fileId);
  return { error: error?.message ?? null };
}

export async function getPortfolioItemWithFiles(
  supabase: Client,
  userId: string,
  itemId: string
): Promise<PortfolioItemWithFiles | null> {
  const item = await getPortfolioItem(supabase, userId, itemId);
  if (!item) return null;
  const files = await listFilesForItem(supabase, userId, itemId);
  return { ...item, files };
}

// --- Storage ------------------------------------------------------------
// Every call here runs against the authenticated user's own session (the
// server client built from their cookies — see lib/supabase/server.ts), so
// the bucket's own RLS policies (see the migration) are the real
// enforcement; no service-role key is ever read in this module.

export async function uploadPortfolioFileObject(
  supabase: Client,
  storagePath: string,
  body: File | Blob | Buffer | ArrayBuffer,
  mimeType: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.storage.from(STUDENT_PORTFOLIO_BUCKET).upload(storagePath, body, {
    contentType: mimeType,
    upsert: false,
  });
  return { error: error?.message ?? null };
}

export async function removePortfolioStorageObjects(supabase: Client, storagePaths: readonly string[]): Promise<{ error: string | null }> {
  if (storagePaths.length === 0) return { error: null };
  const { error } = await supabase.storage.from(STUDENT_PORTFOLIO_BUCKET).remove([...storagePaths]);
  return { error: error?.message ?? null };
}

export async function createPortfolioFileSignedUrl(
  supabase: Client,
  storagePath: string,
  expiresInSeconds: number
): Promise<{ url: string | null; error: string | null }> {
  const { data, error } = await supabase.storage.from(STUDENT_PORTFOLIO_BUCKET).createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data) return { url: null, error: error?.message ?? "Couldn't create a download link." };
  return { url: data.signedUrl, error: null };
}

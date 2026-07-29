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
    activity_category_key: input.activityCategoryKey ?? null,
    project_context: input.projectContext ?? null,
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
  if (patch.activityCategoryKey !== undefined) update.activity_category_key = patch.activityCategoryKey;
  if (patch.projectContext !== undefined) update.project_context = patch.projectContext;
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
  evidenceRole?: Database["public"]["Tables"]["portfolio_files"]["Row"]["evidence_role"];
  contentHash?: string | null;
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
      evidence_role: meta.evidenceRole ?? null,
      content_hash: meta.contentHash ?? null,
    })
    .select("id")
    .single();

  if (error) return { fileId: null, error: error.message };
  return { fileId: data.id, error: null };
}

/** Whether this exact file content already backs a *different* claim for this student (spec section 7/9: "reusing the same document, image, certificate, or URL") — a soft signal, never blocking. Mirrors verification/repository.ts's findDuplicateEvidenceUsage. */
export async function findDuplicateFileHashUsage(supabase: Client, userId: string, contentHash: string, excludeFileId?: string): Promise<boolean> {
  let query = supabase.from("portfolio_files").select("id").eq("user_id", userId).eq("content_hash", contentHash);
  if (excludeFileId) query = query.neq("id", excludeFileId);
  const { data, error } = await query.limit(1);
  if (error) {
    console.error("[portfolio] failed to check duplicate file hash:", error.message);
    return false;
  }
  return (data ?? []).length > 0;
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

// --- Personal/physical/creative project details (Milestone 10.7) ----------

type PersonalProjectDetailsRow = Database["public"]["Tables"]["portfolio_personal_project_details"]["Row"];
type PersonalProjectDetailsInsert = Database["public"]["Tables"]["portfolio_personal_project_details"]["Insert"];

export async function getPersonalProjectDetails(supabase: Client, userId: string, itemId: string): Promise<PersonalProjectDetailsRow | null> {
  const { data, error } = await supabase
    .from("portfolio_personal_project_details")
    .select("*")
    .eq("user_id", userId)
    .eq("portfolio_item_id", itemId)
    .maybeSingle();
  if (error) {
    console.error("[portfolio] failed to load personal project details:", error.message);
    return null;
  }
  return data;
}

/** Upserted on the migration's unique(portfolio_item_id) — saving again always replaces the prior answers rather than erroring or duplicating. */
export async function upsertPersonalProjectDetails(
  supabase: Client,
  row: PersonalProjectDetailsInsert
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("portfolio_personal_project_details").upsert(row, { onConflict: "portfolio_item_id" });
  return { error: error?.message ?? null };
}

// --- Universal entry narrative (Milestone 10.8) ----------------------------

type EntryNarrativeRow = Database["public"]["Tables"]["portfolio_entry_narrative"]["Row"];
type EntryNarrativeInsert = Database["public"]["Tables"]["portfolio_entry_narrative"]["Insert"];

export async function getEntryNarrative(supabase: Client, userId: string, itemId: string): Promise<EntryNarrativeRow | null> {
  const { data, error } = await supabase
    .from("portfolio_entry_narrative")
    .select("*")
    .eq("user_id", userId)
    .eq("portfolio_item_id", itemId)
    .maybeSingle();
  if (error) {
    console.error("[portfolio] failed to load entry narrative:", error.message);
    return null;
  }
  return data;
}

/** Upserted on the migration's unique(portfolio_item_id) — saving again always replaces the prior answers rather than erroring or duplicating. */
export async function upsertEntryNarrative(supabase: Client, row: EntryNarrativeInsert): Promise<{ error: string | null }> {
  const { error } = await supabase.from("portfolio_entry_narrative").upsert(row, { onConflict: "portfolio_item_id" });
  return { error: error?.message ?? null };
}

// --- Team-project details & collaborators (Milestone 10.8) ----------------

type TeamDetailsRow = Database["public"]["Tables"]["portfolio_team_details"]["Row"];
type TeamDetailsInsert = Database["public"]["Tables"]["portfolio_team_details"]["Insert"];
type TeamCollaboratorRow = Database["public"]["Tables"]["portfolio_team_collaborators"]["Row"];
type TeamCollaboratorInsert = Database["public"]["Tables"]["portfolio_team_collaborators"]["Insert"];

export async function getTeamDetails(supabase: Client, userId: string, itemId: string): Promise<TeamDetailsRow | null> {
  const { data, error } = await supabase
    .from("portfolio_team_details")
    .select("*")
    .eq("user_id", userId)
    .eq("portfolio_item_id", itemId)
    .maybeSingle();
  if (error) {
    console.error("[portfolio] failed to load team details:", error.message);
    return null;
  }
  return data;
}

export async function upsertTeamDetails(supabase: Client, row: TeamDetailsInsert): Promise<{ error: string | null }> {
  const { error } = await supabase.from("portfolio_team_details").upsert(row, { onConflict: "portfolio_item_id" });
  return { error: error?.message ?? null };
}

export async function listTeamCollaborators(supabase: Client, userId: string, itemId: string): Promise<TeamCollaboratorRow[]> {
  const { data, error } = await supabase
    .from("portfolio_team_collaborators")
    .select("*")
    .eq("user_id", userId)
    .eq("portfolio_item_id", itemId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[portfolio] failed to load team collaborators:", error.message);
    return [];
  }
  return data ?? [];
}

export async function addTeamCollaborator(supabase: Client, row: TeamCollaboratorInsert): Promise<{ error: string | null }> {
  const { error } = await supabase.from("portfolio_team_collaborators").insert(row);
  return { error: error?.message ?? null };
}

export async function removeTeamCollaborator(supabase: Client, userId: string, collaboratorId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("portfolio_team_collaborators").delete().eq("user_id", userId).eq("id", collaboratorId);
  return { error: error?.message ?? null };
}

// --- Physical-artifact possession challenges (Milestone 10.7) -------------

type PossessionChallengeRow = Database["public"]["Tables"]["portfolio_possession_challenges"]["Row"];
type PossessionChallengeInsert = Database["public"]["Tables"]["portfolio_possession_challenges"]["Insert"];

export async function createPossessionChallenge(
  supabase: Client,
  row: PossessionChallengeInsert
): Promise<{ challenge: PossessionChallengeRow | null; error: string | null }> {
  const { data, error } = await supabase.from("portfolio_possession_challenges").insert(row).select("*").single();
  if (error) return { challenge: null, error: error.message };
  return { challenge: data, error: null };
}

export async function getPossessionChallenge(supabase: Client, userId: string, challengeId: string): Promise<PossessionChallengeRow | null> {
  const { data, error } = await supabase.from("portfolio_possession_challenges").select("*").eq("user_id", userId).eq("id", challengeId).maybeSingle();
  if (error) {
    console.error("[portfolio] failed to load possession challenge:", error.message);
    return null;
  }
  return data;
}

export async function attachPossessionChallengeEvidence(supabase: Client, userId: string, challengeId: string, fileId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("portfolio_possession_challenges").update({ evidence_file_id: fileId }).eq("user_id", userId).eq("id", challengeId);
  return { error: error?.message ?? null };
}

export async function countRecentPossessionChallengesForUser(supabase: Client, userId: string, sinceIso: string): Promise<number> {
  const { count, error } = await supabase
    .from("portfolio_possession_challenges")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", sinceIso);
  if (error) {
    console.error("[portfolio] failed to count recent possession challenges:", error.message);
    return 0;
  }
  return count ?? 0;
}

/** Reviewer-only — visually confirming the challenge code is present in the attached photo has no automated equivalent in this codebase (no OCR/vision connector), so this always runs through a service-role connection after a reviewer looks, never from the student's own session (see the migration's update policy). */
export async function confirmPossessionChallengeAsServiceRole(serviceClient: Client, challengeId: string): Promise<{ error: string | null }> {
  const { error } = await serviceClient
    .from("portfolio_possession_challenges")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
    .eq("id", challengeId);
  return { error: error?.message ?? null };
}

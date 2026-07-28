import { createHash } from "node:crypto";

import { createClient as createServiceRoleClient, type SupabaseClient } from "@supabase/supabase-js";

import { OSINT_EVIDENCE_RETENTION_DAYS } from "@/lib/osint/constants";
import type { Database } from "@/types/database";
import type { PortfolioOsintCheck, PortfolioOsintConflict, PortfolioOsintEvidence, PortfolioOsintReviewEvent } from "@/types/osint";

type Client = SupabaseClient<Database>;
type CheckInsert = Database["public"]["Tables"]["portfolio_osint_checks"]["Insert"];
type CheckUpdate = Database["public"]["Tables"]["portfolio_osint_checks"]["Update"];
type EvidenceInsert = Database["public"]["Tables"]["portfolio_osint_evidence"]["Insert"];
type ConflictInsert = Database["public"]["Tables"]["portfolio_osint_conflicts"]["Insert"];
type ReviewEventInsert = Database["public"]["Tables"]["portfolio_osint_review_events"]["Insert"];

/** sha256 of the normalized (url, extracted fields) pair — never of full page content (spec section 4). */
export function computeContentHash(sourceUrl: string, extractedFields: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify({ url: sourceUrl, fields: extractedFields })).digest("hex");
}

export function computeExpiryFromNow(retentionDays: number = OSINT_EVIDENCE_RETENTION_DAYS, now: Date = new Date()): string {
  return new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

// --- Student-facing reads/writes — always the caller's own session client,
// RLS-enforced (auth.uid() = user_id).

export async function createCheck(supabase: Client, insert: CheckInsert): Promise<{ check: PortfolioOsintCheck | null; error: string | null }> {
  const { data, error } = await supabase.from("portfolio_osint_checks").insert(insert).select("*").single();
  return { check: data, error: error?.message ?? null };
}

export async function updateCheck(supabase: Client, userId: string, checkId: string, patch: CheckUpdate): Promise<{ error: string | null }> {
  const { error } = await supabase.from("portfolio_osint_checks").update(patch).eq("user_id", userId).eq("id", checkId);
  return { error: error?.message ?? null };
}

export async function getLatestCheckForItem(supabase: Client, userId: string, itemId: string): Promise<PortfolioOsintCheck | null> {
  const { data, error } = await supabase
    .from("portfolio_osint_checks")
    .select("*")
    .eq("user_id", userId)
    .eq("portfolio_item_id", itemId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[osint] failed to load latest check:", error.message);
    return null;
  }
  return data;
}

export async function getCheckById(supabase: Client, userId: string, checkId: string): Promise<PortfolioOsintCheck | null> {
  const { data, error } = await supabase.from("portfolio_osint_checks").select("*").eq("user_id", userId).eq("id", checkId).maybeSingle();
  if (error) {
    console.error("[osint] failed to load check:", error.message);
    return null;
  }
  return data;
}

export async function listEvidenceForCheck(supabase: Client, userId: string, checkId: string): Promise<PortfolioOsintEvidence[]> {
  const { data, error } = await supabase.from("portfolio_osint_evidence").select("*").eq("user_id", userId).eq("check_id", checkId).order("authority_level", { ascending: true });
  if (error) {
    console.error("[osint] failed to load evidence:", error.message);
    return [];
  }
  return data ?? [];
}

export async function listConflictsForCheck(supabase: Client, userId: string, checkId: string): Promise<PortfolioOsintConflict[]> {
  const { data, error } = await supabase.from("portfolio_osint_conflicts").select("*").eq("user_id", userId).eq("check_id", checkId).order("created_at", { ascending: true });
  if (error) {
    console.error("[osint] failed to load conflicts:", error.message);
    return [];
  }
  return data ?? [];
}

/** Inserts one evidence record, silently absorbing the unique(check_id, content_hash) dedupe constraint as "already recorded" rather than an error — see the migration's portfolio_osint_evidence_dedupe constraint. */
export async function insertEvidence(supabase: Client, evidence: EvidenceInsert): Promise<{ error: string | null }> {
  const { error } = await supabase.from("portfolio_osint_evidence").insert(evidence);
  if (error && error.code !== "23505") return { error: error.message };
  return { error: null };
}

export async function insertConflict(supabase: Client, conflict: ConflictInsert): Promise<{ error: string | null }> {
  const { error } = await supabase.from("portfolio_osint_conflicts").insert(conflict);
  return { error: error?.message ?? null };
}

/** Whether this exact source URL already backs a *different* item's evidence for this student — feeds the "reused evidence across unrelated claims" score penalty (spec section 7). */
export async function isEvidenceReusedAcrossOtherItems(supabase: Client, userId: string, itemId: string, sourceUrl: string): Promise<boolean> {
  const { data: otherChecks, error } = await supabase
    .from("portfolio_osint_checks")
    .select("id")
    .eq("user_id", userId)
    .neq("portfolio_item_id", itemId);
  if (error || !otherChecks || otherChecks.length === 0) return false;

  const otherCheckIds = otherChecks.map((c) => c.id);
  const { data: reused, error: evidenceError } = await supabase
    .from("portfolio_osint_evidence")
    .select("id")
    .eq("user_id", userId)
    .eq("source_url", sourceUrl)
    .in("check_id", otherCheckIds)
    .limit(1);
  if (evidenceError) {
    console.error("[osint] failed to check evidence reuse:", evidenceError.message);
    return false;
  }
  return (reused ?? []).length > 0;
}

/** Deletes every check (and, via cascade, its evidence/conflicts) for one item — the student-facing "delete public-source evidence" action (spec section 9). Never touches portfolio_verifications. */
export async function deleteChecksForItem(supabase: Client, userId: string, itemId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("portfolio_osint_checks").delete().eq("user_id", userId).eq("portfolio_item_id", itemId);
  return { error: error?.message ?? null };
}

export async function deleteCheck(supabase: Client, userId: string, checkId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("portfolio_osint_checks").delete().eq("user_id", userId).eq("id", checkId);
  return { error: error?.message ?? null };
}

// --- Service-role access — reviewer inspection/override only, same
// convention as src/lib/verification/repository.ts: every call site
// validates authorization *before* ever constructing this client.

export function createOsintServiceRoleClient(): Client {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — required for the OSINT reviewer flow.");
  }
  return createServiceRoleClient<Database>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

export type OsintReviewQueueEntry = {
  check: PortfolioOsintCheck;
  itemTitle: string;
};

export async function listOsintReviewQueue(serviceClient: Client): Promise<OsintReviewQueueEntry[]> {
  const { data: checks, error } = await serviceClient
    .from("portfolio_osint_checks")
    .select("*")
    .eq("status", "completed")
    .eq("final_support_level", "needs_review")
    .order("completed_at", { ascending: true });
  if (error) {
    console.error("[osint] failed to load review queue:", error.message);
    return [];
  }
  if (!checks || checks.length === 0) return [];

  const itemIds = checks.map((c) => c.portfolio_item_id);
  const { data: items, error: itemsError } = await serviceClient.from("portfolio_items").select("id, title").in("id", itemIds);
  if (itemsError) {
    console.error("[osint] failed to load review queue items:", itemsError.message);
    return [];
  }
  const itemById = new Map((items ?? []).map((item) => [item.id, item.title]));
  return checks
    .map((check) => {
      const itemTitle = itemById.get(check.portfolio_item_id);
      return itemTitle ? { check, itemTitle } : null;
    })
    .filter((entry): entry is OsintReviewQueueEntry => entry !== null);
}

export async function getCheckWithFindingsAsServiceRole(
  serviceClient: Client,
  checkId: string
): Promise<{ check: PortfolioOsintCheck; evidence: PortfolioOsintEvidence[]; conflicts: PortfolioOsintConflict[] } | null> {
  const { data: check, error } = await serviceClient.from("portfolio_osint_checks").select("*").eq("id", checkId).maybeSingle();
  if (error || !check) {
    if (error) console.error("[osint] failed to load check (service role):", error.message);
    return null;
  }
  const [{ data: evidence }, { data: conflicts }] = await Promise.all([
    serviceClient.from("portfolio_osint_evidence").select("*").eq("check_id", checkId),
    serviceClient.from("portfolio_osint_conflicts").select("*").eq("check_id", checkId),
  ]);
  return { check, evidence: evidence ?? [], conflicts: conflicts ?? [] };
}

export async function updateCheckAsServiceRole(serviceClient: Client, checkId: string, patch: CheckUpdate): Promise<{ error: string | null }> {
  const { error } = await serviceClient.from("portfolio_osint_checks").update(patch).eq("id", checkId);
  return { error: error?.message ?? null };
}

export async function insertReviewEventAsServiceRole(serviceClient: Client, event: ReviewEventInsert): Promise<{ error: string | null }> {
  const { error } = await serviceClient.from("portfolio_osint_review_events").insert(event);
  return { error: error?.message ?? null };
}

export async function listReviewEventsForCheck(supabase: Client, userId: string, checkId: string): Promise<PortfolioOsintReviewEvent[]> {
  const { data, error } = await supabase
    .from("portfolio_osint_review_events")
    .select("*")
    .eq("user_id", userId)
    .eq("check_id", checkId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[osint] failed to load review events:", error.message);
    return [];
  }
  return data ?? [];
}

/** Retention sweep (spec section 4) — deletes checks whose expires_at has passed. Not wired to a scheduler in this codebase (see the final report's limitations); safe to run from a future cron job or admin script via the service-role client. */
export async function deleteExpiredChecksAsServiceRole(serviceClient: Client, now: Date = new Date()): Promise<{ deletedCount: number; error: string | null }> {
  const { data, error } = await serviceClient.from("portfolio_osint_checks").delete().lt("expires_at", now.toISOString()).select("id");
  if (error) return { deletedCount: 0, error: error.message };
  return { deletedCount: data?.length ?? 0, error: null };
}

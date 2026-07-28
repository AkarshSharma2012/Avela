import { createClient as createServiceRoleClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import type {
  PortfolioVerification,
  PortfolioVerificationEvent,
  PortfolioVerificationMetadata,
} from "@/types/verification";

type Client = SupabaseClient<Database>;
type VerificationUpdate = Database["public"]["Tables"]["portfolio_verifications"]["Update"];
type EventInsert = Database["public"]["Tables"]["portfolio_verification_events"]["Insert"];

// --- Student-facing reads/writes — always the caller's own session client,
// RLS-enforced (auth.uid() = user_id), same as every other portfolio table.

export async function getVerificationForItem(supabase: Client, userId: string, itemId: string): Promise<PortfolioVerification | null> {
  const { data, error } = await supabase
    .from("portfolio_verifications")
    .select("*")
    .eq("user_id", userId)
    .eq("portfolio_item_id", itemId)
    .maybeSingle();

  if (error) {
    console.error("[verification] failed to load verification:", error.message);
    return null;
  }
  return data;
}

/** Every verification row a student has, across every item — for the Portfolio Center's badges/filters without one query per item. */
export async function listVerificationsForUser(supabase: Client, userId: string): Promise<Map<string, PortfolioVerification>> {
  const { data, error } = await supabase.from("portfolio_verifications").select("*").eq("user_id", userId);

  if (error) {
    console.error("[verification] failed to load verifications:", error.message);
    return new Map();
  }
  return new Map((data ?? []).map((row) => [row.portfolio_item_id, row]));
}

/** Select-then-insert with the migration's unique(portfolio_item_id) as the race-safety backstop — same pattern as attachEvidenceLink. Every item gets exactly one row, created lazily on first touch rather than by a trigger, so an item with no verification activity yet simply has no row (read paths treat "no row" as `unverified`). */
export async function ensureVerificationRow(supabase: Client, userId: string, itemId: string): Promise<{ verification: PortfolioVerification | null; error: string | null }> {
  const existing = await getVerificationForItem(supabase, userId, itemId);
  if (existing) return { verification: existing, error: null };

  const { data, error } = await supabase
    .from("portfolio_verifications")
    .insert({ user_id: userId, portfolio_item_id: itemId })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const raced = await getVerificationForItem(supabase, userId, itemId);
      return raced ? { verification: raced, error: null } : { verification: null, error: error.message };
    }
    return { verification: null, error: error.message };
  }
  return { verification: data, error: null };
}

export async function updateVerification(
  supabase: Client,
  userId: string,
  verificationId: string,
  patch: VerificationUpdate
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("portfolio_verifications").update(patch).eq("user_id", userId).eq("id", verificationId);
  return { error: error?.message ?? null };
}

/**
 * Insertable from the student's own authenticated session — the migration's
 * RLS policy only allows `actor_type: "student"` for any event_type other
 * than `consistency_check_run`, which is the one case a "system" actor can
 * be logged this way (it runs synchronously inside the student's own
 * evidence-upload action — see actions.ts). Every other system/verifier/
 * reviewer event goes through insertVerificationEventAsServiceRole instead.
 */
export async function insertVerificationEvent(
  supabase: Client,
  event: Omit<EventInsert, "actor_type"> & { actor_type: "student" | "system" }
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("portfolio_verification_events").insert(event);
  return { error: error?.message ?? null };
}

export async function listEventsForVerification(
  supabase: Client,
  userId: string,
  verificationId: string
): Promise<PortfolioVerificationEvent[]> {
  const { data, error } = await supabase
    .from("portfolio_verification_events")
    .select("*")
    .eq("user_id", userId)
    .eq("verification_id", verificationId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[verification] failed to load verification events:", error.message);
    return [];
  }
  return data ?? [];
}

/** Whether the given evidence (file or URL) already backs a *different* item for this same student — feeds the "duplicate evidence reused" warning (never blocking, see evidence-checks.ts). */
export async function findDuplicateEvidenceUsage(
  supabase: Client,
  userId: string,
  itemId: string,
  evidence: { fileId?: string | null; url?: string | null }
): Promise<boolean> {
  if (!evidence.fileId && !evidence.url) return false;

  let query = supabase.from("portfolio_verifications").select("id").eq("user_id", userId).neq("portfolio_item_id", itemId);
  if (evidence.fileId) {
    query = query.eq("evidence_file_id", evidence.fileId);
  } else if (evidence.url) {
    query = query.eq("evidence_url", evidence.url);
  }
  const { data, error } = await query.limit(1);
  if (error) {
    console.error("[verification] failed to check duplicate evidence:", error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

// --- Service-role access — only for the two flows where the acting party
// is *not* the owning student's own authenticated session: a verifier
// clicking their one-time link (no session at all), and an allowlisted
// reviewer resolving another student's `needs_review` item. Both call
// sites validate their own authorization *before* ever constructing this
// client (see actions.ts) — this function itself grants no access control,
// it only opens the connection. Never imported by a Client Component.

export function createVerificationServiceRoleClient(): Client {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — required for the verifier/reviewer flow.");
  }
  return createServiceRoleClient<Database>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

export type VerifierClaimView = {
  verification: PortfolioVerification;
  itemTitle: string;
  itemType: Database["public"]["Tables"]["portfolio_items"]["Row"]["item_type"];
  itemOrganization: string | null;
  itemStartDate: string | null;
  itemEndDate: string | null;
};

/**
 * Looks up a verification row by the *hash* of whatever token the visitor
 * presented — the raw token is never stored, so this is the only possible
 * lookup shape. Returns only the handful of fields a verifier is allowed to
 * see (spec section 8: never the student's full portfolio), never the full
 * portfolio_items row.
 */
export async function findVerifierClaimByTokenHash(serviceClient: Client, tokenHash: string): Promise<VerifierClaimView | null> {
  const { data: verification, error } = await serviceClient
    .from("portfolio_verifications")
    .select("*")
    .eq("verification_code_hash", tokenHash)
    .maybeSingle();

  if (error) {
    console.error("[verification] failed to look up verifier token:", error.message);
    return null;
  }
  if (!verification) return null;

  const { data: item, error: itemError } = await serviceClient
    .from("portfolio_items")
    .select("title, item_type, organization, start_date, end_date")
    .eq("id", verification.portfolio_item_id)
    .maybeSingle();

  if (itemError || !item) {
    if (itemError) console.error("[verification] failed to load claim item:", itemError.message);
    return null;
  }

  return {
    verification,
    itemTitle: item.title,
    itemType: item.item_type,
    itemOrganization: item.organization,
    itemStartDate: item.start_date,
    itemEndDate: item.end_date,
  };
}

export async function updateVerificationAsServiceRole(
  serviceClient: Client,
  verificationId: string,
  patch: VerificationUpdate
): Promise<{ error: string | null }> {
  const { error } = await serviceClient.from("portfolio_verifications").update(patch).eq("id", verificationId);
  return { error: error?.message ?? null };
}

export async function insertVerificationEventAsServiceRole(
  serviceClient: Client,
  event: EventInsert
): Promise<{ error: string | null }> {
  const { error } = await serviceClient.from("portfolio_verification_events").insert(event);
  return { error: error?.message ?? null };
}

export type ReviewQueueEntry = {
  verification: PortfolioVerification;
  itemTitle: string;
  itemType: Database["public"]["Tables"]["portfolio_items"]["Row"]["item_type"];
};

/** Every `needs_review` item across every student — reviewer-only, service-role, never reachable from a client-facing RLS policy. See the reviewer page's allowlist gate in actions.ts before this is ever called. */
export async function listReviewQueue(serviceClient: Client): Promise<ReviewQueueEntry[]> {
  const { data: verifications, error } = await serviceClient
    .from("portfolio_verifications")
    .select("*")
    .eq("verification_level", "needs_review")
    .order("updated_at", { ascending: true });

  if (error) {
    console.error("[verification] failed to load review queue:", error.message);
    return [];
  }
  if (!verifications || verifications.length === 0) return [];

  const itemIds = verifications.map((v) => v.portfolio_item_id);
  const { data: items, error: itemsError } = await serviceClient.from("portfolio_items").select("id, title, item_type").in("id", itemIds);

  if (itemsError) {
    console.error("[verification] failed to load review queue items:", itemsError.message);
    return [];
  }

  const itemById = new Map((items ?? []).map((item) => [item.id, item]));
  return verifications
    .map((verification) => {
      const item = itemById.get(verification.portfolio_item_id);
      return item ? { verification, itemTitle: item.title, itemType: item.item_type } : null;
    })
    .filter((entry): entry is ReviewQueueEntry => entry !== null);
}

export function metadataOf(verification: PortfolioVerification): PortfolioVerificationMetadata {
  return (verification.metadata ?? {}) as PortfolioVerificationMetadata;
}

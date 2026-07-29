import type { SupabaseClient } from "@supabase/supabase-js";

import { createVerificationServiceRoleClient } from "@/lib/verification/repository";
import type { Database } from "@/types/database";
import type { ClaimDimension, ClaimDimensionEvent, ClaimDimensionResult, PortfolioVerificationActorType } from "@/types/claims";
import type { ClaimDimensionStatus } from "@/types/database";

type Client = SupabaseClient<Database>;
type ResultUpdate = Database["public"]["Tables"]["claim_dimension_results"]["Update"];
type EventInsert = Database["public"]["Tables"]["claim_dimension_events"]["Insert"];

// --- Student-facing reads — always the caller's own session client,
// RLS-enforced (auth.uid() = user_id), same pattern as verification/repository.ts.

export async function listDimensionsForItem(supabase: Client, userId: string, itemId: string): Promise<ClaimDimensionResult[]> {
  const { data, error } = await supabase
    .from("claim_dimension_results")
    .select("*")
    .eq("user_id", userId)
    .eq("portfolio_item_id", itemId);

  if (error) {
    console.error("[claims] failed to load dimensions for item:", error.message);
    return [];
  }
  return data ?? [];
}

/** Every dimension row a student has, across every item — keyed by itemId then dimension, for a Portfolio Center summary without one query per item. */
export async function listDimensionsForUser(supabase: Client, userId: string): Promise<Map<string, ClaimDimensionResult[]>> {
  const { data, error } = await supabase.from("claim_dimension_results").select("*").eq("user_id", userId);

  if (error) {
    console.error("[claims] failed to load dimensions for user:", error.message);
    return new Map();
  }

  const byItem = new Map<string, ClaimDimensionResult[]>();
  for (const row of data ?? []) {
    const existing = byItem.get(row.portfolio_item_id) ?? [];
    existing.push(row);
    byItem.set(row.portfolio_item_id, existing);
  }
  return byItem;
}

/** Select-then-insert with the migration's unique(portfolio_item_id, dimension) as the race-safety backstop — same pattern as ensureVerificationRow. */
export async function ensureDimensionRow(
  supabase: Client,
  userId: string,
  itemId: string,
  dimension: ClaimDimension
): Promise<{ result: ClaimDimensionResult | null; error: string | null }> {
  const { data: existing, error: existingError } = await supabase
    .from("claim_dimension_results")
    .select("*")
    .eq("user_id", userId)
    .eq("portfolio_item_id", itemId)
    .eq("dimension", dimension)
    .maybeSingle();

  if (existingError) {
    return { result: null, error: existingError.message };
  }
  if (existing) return { result: existing, error: null };

  const { data, error } = await supabase
    .from("claim_dimension_results")
    .insert({ user_id: userId, portfolio_item_id: itemId, dimension })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: raced } = await supabase
        .from("claim_dimension_results")
        .select("*")
        .eq("user_id", userId)
        .eq("portfolio_item_id", itemId)
        .eq("dimension", dimension)
        .maybeSingle();
      return raced ? { result: raced, error: null } : { result: null, error: error.message };
    }
    return { result: null, error: error.message };
  }
  return { result: data, error: null };
}

/** A student self-reporting partial support — the only status transition a student's own session may perform (see dimension-level.ts). */
export async function studentUpdateDimension(
  supabase: Client,
  userId: string,
  result: ClaimDimensionResult,
  patch: { evidenceRef?: Record<string, unknown>; reason?: string }
): Promise<{ error: string | null }> {
  const update: ResultUpdate = {
    status: "partially_supported",
    stale: false,
    updated_by_actor_type: "student",
    ...(patch.evidenceRef ? { evidence_ref: patch.evidenceRef } : {}),
  };
  const { error } = await supabase.from("claim_dimension_results").update(update).eq("user_id", userId).eq("id", result.id);
  if (error) return { error: error.message };

  const event: EventInsert = {
    user_id: userId,
    portfolio_item_id: result.portfolio_item_id,
    dimension_result_id: result.id,
    dimension: result.dimension,
    actor_type: "student",
    previous_status: result.status,
    new_status: "partially_supported",
    reason: patch.reason ?? null,
  };
  const { error: eventError } = await supabase.from("claim_dimension_events").insert(event);
  return { error: eventError?.message ?? null };
}

// --- Service-role access — for system/verifier/reviewer transitions, the
// same split as verification/repository.ts: authorization is validated by
// the caller *before* this client is ever constructed; this module grants
// no access control itself.

export { createVerificationServiceRoleClient as createClaimsServiceRoleClient };

/** Applies a status transition and its audit event atomically-enough for this app's needs (sequential, both service-role). Callers must have already checked canTransitionDimensionStatus. */
export async function applyDimensionTransition(
  serviceClient: Client,
  result: ClaimDimensionResult,
  next: { status: ClaimDimensionStatus; actorType: PortfolioVerificationActorType; evidenceRef?: Record<string, unknown>; reason?: string; stale?: boolean }
): Promise<{ error: string | null }> {
  const update: ResultUpdate = {
    status: next.status,
    updated_by_actor_type: next.actorType,
    stale: next.stale ?? false,
    ...(next.evidenceRef ? { evidence_ref: next.evidenceRef } : {}),
  };
  const { error } = await serviceClient.from("claim_dimension_results").update(update).eq("id", result.id);
  if (error) return { error: error.message };

  const event: EventInsert = {
    user_id: result.user_id,
    portfolio_item_id: result.portfolio_item_id,
    dimension_result_id: result.id,
    dimension: result.dimension,
    actor_type: next.actorType,
    previous_status: result.status,
    new_status: next.status,
    reason: next.reason ?? null,
  };
  const { error: eventError } = await serviceClient.from("claim_dimension_events").insert(event);
  return { error: eventError?.message ?? null };
}

/** Marks a dimension stale without changing its status — used by material-edit invalidation (see claims/invalidation.ts) so a reviewer can see "this was strongly supported, but the claim changed" rather than losing that context. */
export async function markDimensionStale(
  serviceClient: Client,
  result: ClaimDimensionResult,
  reason: string
): Promise<{ error: string | null }> {
  const { error } = await serviceClient.from("claim_dimension_results").update({ stale: true } satisfies ResultUpdate).eq("id", result.id);
  if (error) return { error: error.message };

  const event: EventInsert = {
    user_id: result.user_id,
    portfolio_item_id: result.portfolio_item_id,
    dimension_result_id: result.id,
    dimension: result.dimension,
    actor_type: "system",
    previous_status: result.status,
    new_status: result.status,
    reason,
  };
  const { error: eventError } = await serviceClient.from("claim_dimension_events").insert(event);
  return { error: eventError?.message ?? null };
}

export async function listEventsForDimension(supabase: Client, userId: string, dimensionResultId: string): Promise<ClaimDimensionEvent[]> {
  const { data, error } = await supabase
    .from("claim_dimension_events")
    .select("*")
    .eq("user_id", userId)
    .eq("dimension_result_id", dimensionResultId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[claims] failed to load dimension events:", error.message);
    return [];
  }
  return data ?? [];
}

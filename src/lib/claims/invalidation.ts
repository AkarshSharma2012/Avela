/**
 * Material-edit invalidation (spec section 8): when a material field
 * changes, only the dimension(s) that field actually supports are staled
 * or downgraded — never the whole entry, and never by deleting anything.
 * The original audit trail (claim_dimension_events) is never touched; a
 * new event is appended explaining which field changed, in neutral
 * language (see docs/security.md).
 */

import { applyDimensionTransition, listDimensionsForUser, markDimensionStale } from "@/lib/claims/repository";
import { buildMaterialChangeReason, type MaterialFieldName } from "@/lib/claims/material-hash";
import type { ClaimDimension, ClaimDimensionResult } from "@/types/claims";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

/** Which dimension(s) each material field actually supports — deliberately narrow, mirroring field-confirmation.ts's per-field mapping so an organization-name fix never staled, say, impact_or_outcome. */
export const MATERIAL_FIELD_TO_DIMENSIONS: Record<MaterialFieldName, readonly ClaimDimension[]> = {
  title: ["project_or_activity_exists", "output_or_deliverable"],
  organization: ["organization_relationship"],
  role: ["role"],
  startDate: ["dates_and_duration"],
  endDate: ["dates_and_duration"],
  description: ["project_or_activity_exists", "output_or_deliverable"],
  outcome: ["impact_or_outcome"],
  hoursPerWeek: ["dates_and_duration"],
  weeksPerYear: ["dates_and_duration"],
  projectContext: ["organization_relationship"],
  url: ["account_or_asset_control", "output_or_deliverable"],
};

export function dimensionsAffectedByFields(changedFields: MaterialFieldName[]): ClaimDimension[] {
  const affected = new Set<ClaimDimension>();
  for (const field of changedFields) {
    for (const dimension of MATERIAL_FIELD_TO_DIMENSIONS[field]) affected.add(dimension);
  }
  return [...affected];
}

const STRONG_STATUSES = new Set(["strongly_supported", "externally_confirmed"]);

/**
 * Applies the invalidation to every existing dimension row for this item
 * that falls in the affected set. A dimension that was strongly supported
 * or externally confirmed steps back to unable_to_verify (the trust that
 * applied to the *old* claim no longer automatically applies to the new
 * one); anything else is simply marked stale in place. Rows that don't
 * exist yet need no action — there's nothing to invalidate.
 */
export async function invalidateDimensionsForMaterialEdit(
  serviceClient: Client,
  userId: string,
  itemId: string,
  changedFields: MaterialFieldName[]
): Promise<void> {
  if (changedFields.length === 0) return;
  const affectedDimensions = new Set(dimensionsAffectedByFields(changedFields));
  if (affectedDimensions.size === 0) return;

  const reason = buildMaterialChangeReason(changedFields);
  const byItem = await listDimensionsForUser(serviceClient, userId);
  const rows = (byItem.get(itemId) ?? []).filter((row: ClaimDimensionResult) => affectedDimensions.has(row.dimension));

  for (const row of rows) {
    if (STRONG_STATUSES.has(row.status)) {
      await applyDimensionTransition(serviceClient, row, { status: "unable_to_verify", actorType: "system", reason, stale: true });
    } else {
      await markDimensionStale(serviceClient, row, reason);
    }
  }
}

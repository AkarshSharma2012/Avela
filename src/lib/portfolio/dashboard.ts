/**
 * Dependency-free aggregation for the dashboard's small Portfolio card —
 * no Supabase client, unit-testable without a database. Deliberately
 * small (spec section 9: "do not overcrowd the dashboard").
 */

import { computeProfileStrength, isPortfolioItemIncomplete, type ProfileStrength } from "@/lib/portfolio/strength";
import type { PortfolioVerificationLevel } from "@/types/database";
import type { PortfolioItem } from "@/types/portfolio";

export type PortfolioDashboardSummary = {
  profileStrength: ProfileStrength;
  incompleteItemCount: number;
  applicationsMissingEvidenceCount: number;
};

export type PortfolioDashboardInput = {
  items: readonly PortfolioItem[];
  fileCountByItemId: ReadonlyMap<string, number>;
  linkedItemIds: ReadonlySet<string>;
  verificationLevelByItemId?: ReadonlyMap<string, PortfolioVerificationLevel>;
  activePlanIds: readonly string[];
  evidenceCountByPlanId: ReadonlyMap<string, number>;
};

export function buildPortfolioDashboardSummary(input: PortfolioDashboardInput): PortfolioDashboardSummary {
  const profileStrength = computeProfileStrength({
    items: input.items,
    fileCountByItemId: input.fileCountByItemId,
    linkedItemIds: input.linkedItemIds,
    verificationLevelByItemId: input.verificationLevelByItemId,
  });

  const incompleteItemCount = input.items.filter(isPortfolioItemIncomplete).length;

  const applicationsMissingEvidenceCount = input.activePlanIds.filter(
    (planId) => (input.evidenceCountByPlanId.get(planId) ?? 0) === 0
  ).length;

  return { profileStrength, incompleteItemCount, applicationsMissingEvidenceCount };
}

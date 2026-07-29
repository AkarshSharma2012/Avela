/**
 * Whether a claim needs an organization at all (spec section 5/6).
 * `null` (not yet classified — every item created before Milestone 10.7)
 * is treated the same as today's behavior: organization stays optional,
 * so no existing item is retroactively broken by this migration.
 */
import type { PortfolioItemProjectContext } from "@/types/database";

export function isOrganizationRequired(projectContext: PortfolioItemProjectContext | null): boolean {
  return projectContext === "org_linked";
}

export function validateOrganizationRequirement(projectContext: PortfolioItemProjectContext | null, verifierOrganization: string | null): string | null {
  if (isOrganizationRequired(projectContext) && !verifierOrganization?.trim()) {
    return "This kind of entry needs an organization — or mark it as a personal project.";
  }
  return null;
}

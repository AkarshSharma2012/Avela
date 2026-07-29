/**
 * Connected-provider registry (spec sections 7-9) — a single honest,
 * versioned-code catalog of every candidate provider across every passion
 * area. Only *instances* (a student's actual connected account, a
 * challenge) are ever persisted in the database; this registry itself is
 * data, exactly like PORTFOLIO_ITEM_TYPES or taxonomy.ts's
 * ACTIVITY_CATEGORIES — adding a provider here never requires a migration.
 *
 * Four tiers, and the registry is honest about which one each provider is
 * actually in:
 *   - "oauth" — a real, already-implemented OAuth connection exists in this
 *     codebase (GitHub only today — verified against GitHub's own OAuth
 *     documentation; see github-oauth.ts).
 *   - "proof_of_control" — the generic public-profile-control challenge
 *     (Phase 5, generic-profile-challenge.ts) applies: the platform has an
 *     editable public page/bio/README a student can place a short-lived
 *     code in.
 *   - "public_link_only" — a student can attach the URL as evidence, but
 *     Avela does not attempt to verify control of it.
 *   - "unsupported_manual_only" — no safe digital verification path exists;
 *     a student can still describe/attach manual evidence, just not through
 *     a connected-provider flow.
 * No provider is ever shown with a "Connect" button unless its tier is
 * "oauth" or "proof_of_control" *and* isProviderAvailable() (see
 * provider-availability.ts) confirms it's actually configured — the app
 * must stay fully functional with zero providers configured.
 */

import type { PassionGroup } from "@/lib/portfolio/taxonomy";
import type { ClaimDimension } from "@/types/claims";

/** The 11 taxonomy passion groups, plus two provider-only groupings (spec sections 8.K/8.L) that don't map to a single activity passion group. */
export type ProviderCategoryGroup = PassionGroup | "learning_and_credentials" | "general_and_custom";

export type ProviderTier = "oauth" | "proof_of_control" | "public_link_only" | "unsupported_manual_only";

export type ProviderEntry = {
  key: string;
  studentFacingName: string;
  categoryGroups: readonly ProviderCategoryGroup[];
  /** Specific taxonomy category keys this provider is especially relevant to, beyond its category group(s). Empty = relevant across the whole group. */
  supportedActivityCategories: readonly string[];
  oauthSupport: boolean;
  publicProfileSupport: boolean;
  proofOfControlSupport: boolean;
  projectSelectionSupport: boolean;
  /** OAuth scopes actually requested, if any — empty for every non-OAuth tier and for GitHub (which sends no scope param at all; see github-oauth.ts). */
  minScopes: readonly string[];
  /** Env vars a real deployment must set for this provider's tier to become available. Empty for tiers that need none. */
  requiredEnvVars: readonly string[];
  disconnectBehavior: string;
  supportableDimensions: readonly ClaimDimension[];
  limitations: readonly string[];
  tier: ProviderTier;
};

const OAUTH_DISCONNECT_BEHAVIOR =
  "Revokes Avela's access immediately; any claim dimension this connection supported steps back to \"unable to verify\" rather than staying confirmed.";
const CHALLENGE_DISCONNECT_BEHAVIOR =
  "The challenge is revoked and expires; a dimension it supported steps back to \"unable to verify\" rather than staying confirmed.";
const LINK_DISCONNECT_BEHAVIOR = "Not connected — nothing to revoke. Removing the link simply removes that piece of evidence.";

const OAUTH_LIMITATIONS = ["Read-only — never requests write access or private-data scopes."] as const;
const CHALLENGE_LIMITATIONS = [
  "Confirms the student can edit this page right now — never confirms authorship of content already there before the challenge.",
] as const;
const LINK_LIMITATIONS = [
  "A link shows that something exists publicly; by itself it never confirms authorship, ownership, or accuracy.",
] as const;
const UNSUPPORTED_LIMITATIONS = ["Not connectable through Avela — add a public link or manual evidence instead."] as const;

function oauthProvider(
  partial: Pick<ProviderEntry, "key" | "studentFacingName" | "categoryGroups" | "projectSelectionSupport" | "requiredEnvVars" | "supportableDimensions">
): ProviderEntry {
  return {
    ...partial,
    supportedActivityCategories: [],
    oauthSupport: true,
    publicProfileSupport: true,
    proofOfControlSupport: false,
    minScopes: [],
    disconnectBehavior: OAUTH_DISCONNECT_BEHAVIOR,
    limitations: OAUTH_LIMITATIONS,
    tier: "oauth",
  };
}

function challengeProvider(
  partial: Pick<ProviderEntry, "key" | "studentFacingName" | "categoryGroups" | "supportableDimensions"> &
    Partial<Pick<ProviderEntry, "supportedActivityCategories">>
): ProviderEntry {
  return {
    ...partial,
    supportedActivityCategories: partial.supportedActivityCategories ?? [],
    oauthSupport: false,
    publicProfileSupport: true,
    proofOfControlSupport: true,
    projectSelectionSupport: false,
    minScopes: [],
    requiredEnvVars: [],
    disconnectBehavior: CHALLENGE_DISCONNECT_BEHAVIOR,
    limitations: CHALLENGE_LIMITATIONS,
    tier: "proof_of_control",
  };
}

function linkOnlyProvider(
  partial: Pick<ProviderEntry, "key" | "studentFacingName" | "categoryGroups"> & Partial<Pick<ProviderEntry, "supportableDimensions" | "supportedActivityCategories">>
): ProviderEntry {
  return {
    ...partial,
    supportedActivityCategories: partial.supportedActivityCategories ?? [],
    oauthSupport: false,
    publicProfileSupport: true,
    proofOfControlSupport: false,
    projectSelectionSupport: false,
    minScopes: [],
    requiredEnvVars: [],
    disconnectBehavior: LINK_DISCONNECT_BEHAVIOR,
    supportableDimensions: partial.supportableDimensions ?? ["project_or_activity_exists", "output_or_deliverable"],
    limitations: LINK_LIMITATIONS,
    tier: "public_link_only",
  };
}

function unsupportedProvider(partial: Pick<ProviderEntry, "key" | "studentFacingName" | "categoryGroups">): ProviderEntry {
  return {
    ...partial,
    supportedActivityCategories: [],
    oauthSupport: false,
    publicProfileSupport: false,
    proofOfControlSupport: false,
    projectSelectionSupport: false,
    minScopes: [],
    requiredEnvVars: [],
    disconnectBehavior: LINK_DISCONNECT_BEHAVIOR,
    supportableDimensions: [],
    limitations: UNSUPPORTED_LIMITATIONS,
    tier: "unsupported_manual_only",
  };
}

export { oauthProvider, challengeProvider, linkOnlyProvider, unsupportedProvider };

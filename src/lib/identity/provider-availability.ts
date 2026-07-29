/**
 * Whether a registry provider (provider-registry-data.ts) can actually be
 * offered right now, and which ones to suggest for a given category (spec
 * section 13: "initially recommend at most three relevant providers,"
 * "See more options" for the rest). Fails closed the same way
 * isGithubOauthConfigured() does — an unconfigured OAuth provider is never
 * offered as connectable, it just quietly isn't shown as a "Connect"
 * option; the app stays fully usable with zero providers configured
 * (public link / files / ask someone / later always remain).
 */

import { resolveCategory, type ActivityCategory } from "@/lib/portfolio/taxonomy";
import { isGithubOauthConfigured } from "@/lib/identity/github-oauth";
import { PROVIDER_REGISTRY } from "@/lib/identity/provider-registry-data";
import type { ProviderEntry } from "@/lib/identity/provider-registry";

const MAX_PRIMARY_SUGGESTIONS = 3;

/** True only when a real "Connect" flow can actually complete for this provider right now. */
export function isProviderAvailable(provider: ProviderEntry): boolean {
  if (provider.tier === "oauth") {
    if (provider.key === "github") return isGithubOauthConfigured();
    // Any future OAuth-tier provider fails closed until it has its own
    // configuration check — never assume availability by tier alone.
    return provider.requiredEnvVars.length > 0 && provider.requiredEnvVars.every((name) => Boolean(process.env[name]));
  }
  if (provider.tier === "proof_of_control") {
    // The generic public-profile challenge (Phase 5) needs no external
    // credentials — it's always available once implemented.
    return true;
  }
  return false;
}

/** Whether this provider should ever render a "Connect" button at all, vs. degrading to "add a public link instead." */
export function isProviderConnectable(provider: ProviderEntry): boolean {
  return (provider.tier === "oauth" || provider.tier === "proof_of_control") && isProviderAvailable(provider);
}

export function findProvider(key: string): ProviderEntry | undefined {
  return PROVIDER_REGISTRY.find((entry) => entry.key === key);
}

export type OfferedProviders = {
  /** At most 3 — the friendly, upfront suggestions (spec section 13). */
  primary: readonly ProviderEntry[];
  /** Everything else relevant to this category, behind "See more options." */
  more: readonly ProviderEntry[];
};

/**
 * Relevant = tagged with this category's passion group, or (once a
 * provider opts in) this exact category key. Connectable providers are
 * ranked ahead of link-only/unsupported ones, since a working "Connect"
 * flow is the most useful default suggestion — but a category with zero
 * connectable providers still resolves cleanly to link-only suggestions,
 * never an empty or broken state.
 */
export function resolveOfferedMethodsForCategory(categoryKey: string | null | undefined): OfferedProviders {
  const category: ActivityCategory = resolveCategory(categoryKey);

  const relevant = PROVIDER_REGISTRY.filter(
    (provider) =>
      provider.categoryGroups.includes(category.passionGroup) || provider.supportedActivityCategories.includes(category.key)
  );

  const ranked = [...relevant].sort((a, b) => {
    const aConnectable = isProviderConnectable(a) ? 1 : 0;
    const bConnectable = isProviderConnectable(b) ? 1 : 0;
    return bConnectable - aConnectable;
  });

  return {
    primary: ranked.slice(0, MAX_PRIMARY_SUGGESTIONS),
    more: ranked.slice(MAX_PRIMARY_SUGGESTIONS),
  };
}

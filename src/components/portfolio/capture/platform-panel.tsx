"use client";

import { useMemo, useState } from "react";
import { Link2, Plug, Search, ShieldCheck } from "lucide-react";

import { Input } from "@/components/ui/input";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { resolveOfferedMethodsForCategory } from "@/lib/identity/provider-availability";
import { PROVIDER_REGISTRY } from "@/lib/identity/provider-registry-data";
import type { ProviderEntry } from "@/lib/identity/provider-registry";

export type PlatformSelection = {
  provider: ProviderEntry;
  /**
   * Whether this platform is a real GitHub-style direct connection or
   * proof-of-control verification (`oauth`/`proof_of_control` tier) versus
   * a plain public link (`public_link_only`). This reflects the registry's
   * own honest classification of the *platform* — not live env
   * configuration: nothing in the guided-capture flow performs a live
   * OAuth handshake at this point (that only happens later, from the item
   * page's verification wizard), so gating this on `isProviderAvailable()`
   * would make the capture-time UI depend on deployment config it doesn't
   * actually need.
   */
  connectable: boolean;
};

type HonestTier = "oauth" | "proof_of_control" | "public_link_only";

const TIER_GROUP: Record<HonestTier, { heading: string; copy: string; actionVerb: string; icon: typeof Plug }> = {
  oauth: {
    heading: "Direct connection",
    copy: "Securely connect a supported platform.",
    actionVerb: "Connect",
    icon: Plug,
  },
  proof_of_control: {
    heading: "Verify a public profile",
    copy: "Add a temporary code or phrase to your public profile so Avela can confirm you control it.",
    actionVerb: "Verify",
    icon: ShieldCheck,
  },
  public_link_only: {
    heading: "Add a public project link",
    copy: "Paste a project, performance, publication, result, or portfolio link.",
    actionVerb: "Add a link",
    icon: Link2,
  },
};

const TIER_ORDER: readonly HonestTier[] = ["oauth", "proof_of_control", "public_link_only"];
const GROUP_CAP = 6;

function honestTierOf(provider: ProviderEntry): HonestTier | null {
  return provider.tier === "unsupported_manual_only" ? null : provider.tier;
}

function ProviderRow({ provider, onSelect }: { provider: ProviderEntry; onSelect: (selection: PlatformSelection) => void }) {
  const tier = honestTierOf(provider);
  const connectable = tier === "oauth" || tier === "proof_of_control";
  const actionLabel = tier ? TIER_GROUP[tier].actionVerb : "Add a link";
  return (
    <button
      type="button"
      onClick={() => onSelect({ provider, connectable })}
      aria-label={`${provider.studentFacingName}, ${actionLabel}`}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-md border border-transparent px-3 py-2 text-left text-sm transition-colors duration-[var(--duration-fast)]",
        "hover:border-border hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
      )}
    >
      <span aria-hidden="true" className="text-foreground">
        {provider.studentFacingName}
      </span>
      <span aria-hidden="true" className={cn("shrink-0 text-xs font-medium", connectable ? "text-primary" : "text-muted-foreground")}>
        {actionLabel}
      </span>
    </button>
  );
}

/**
 * The honest, category-aware provider picker (spec's "PLATFORM-AWARE
 * PROVIDER EXPERIENCE" / "CATEGORY-AWARE PLATFORM ROUTING"). Groups by the
 * `ProviderEntry.tier` the registry already carries — never invents a
 * second classification. Without `categoryKey` (Capture, before a category
 * is chosen) it searches the full registry; with `categoryKey` (Proof, once
 * a category is known) it uses the existing
 * `resolveOfferedMethodsForCategory` ranking so software/art/music/sports/…
 * each surface their own relevant platforms with zero per-category
 * hardcoding here.
 */
function PlatformPanel({
  categoryKey,
  onSelect,
}: {
  categoryKey?: string | null;
  onSelect: (selection: PlatformSelection) => void;
}) {
  const [query, setQuery] = useState("");

  const source: readonly ProviderEntry[] = useMemo(() => {
    if (!categoryKey) return PROVIDER_REGISTRY;
    const offered = resolveOfferedMethodsForCategory(categoryKey);
    return [...offered.primary, ...offered.more];
  }, [categoryKey]);

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle ? source.filter((p) => p.studentFacingName.toLowerCase().includes(needle)) : source;
    const groups: Record<HonestTier, ProviderEntry[]> = { oauth: [], proof_of_control: [], public_link_only: [] };
    for (const provider of filtered) {
      const tier = honestTierOf(provider);
      if (tier) groups[tier].push(provider);
    }
    return groups;
  }, [source, query]);

  const hasAnyResult = TIER_ORDER.some((tier) => grouped[tier].length > 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search platforms…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
          aria-label="Search platforms"
        />
      </div>

      {!categoryKey && (
        <p className="text-xs text-muted-foreground">
          Showing platforms across every category. Pick a category on the next step and this list narrows to the ones that fit your project.
        </p>
      )}

      {!hasAnyResult && <p className="text-sm text-muted-foreground">No platforms match &quot;{query}&quot;.</p>}

      {TIER_ORDER.map((tier) => {
        const providers = grouped[tier];
        if (providers.length === 0) return null;
        const { heading, copy, icon: Icon } = TIER_GROUP[tier];
        const visible = providers.slice(0, GROUP_CAP);
        const rest = providers.slice(GROUP_CAP);

        return (
          <div key={tier} className="flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">{heading}</p>
                <p className="text-xs text-muted-foreground">{copy}</p>
              </div>
            </div>
            <ul className="flex flex-col gap-1">
              {visible.map((provider) => (
                <li key={provider.key}>
                  <ProviderRow provider={provider} onSelect={onSelect} />
                </li>
              ))}
            </ul>
            {rest.length > 0 && (
              <CollapsibleSection trigger={`See ${rest.length} more option${rest.length === 1 ? "" : "s"}`}>
                <ul className="flex flex-col gap-1">
                  {rest.map((provider) => (
                    <li key={provider.key}>
                      <ProviderRow provider={provider} onSelect={onSelect} />
                    </li>
                  ))}
                </ul>
              </CollapsibleSection>
            )}
          </div>
        );
      })}
    </div>
  );
}

export { PlatformPanel };

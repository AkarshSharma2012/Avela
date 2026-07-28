import type { Metadata } from "next";
import { FolderOpen } from "lucide-react";

import { AddItemPanel } from "@/components/portfolio/add-item-panel";
import { ItemTypeBadge } from "@/components/portfolio/item-type-badge";
import { PortfolioFilterForm } from "@/components/portfolio/portfolio-filter-form";
import { PortfolioItemCard } from "@/components/portfolio/portfolio-item-card";
import { ProfileStrengthMeter } from "@/components/portfolio/profile-strength-meter";
import { EmptyState } from "@/components/ui/empty-state";
import { requireProfile } from "@/lib/auth/dal";
import { listLinkedItemIdsForUser } from "@/lib/portfolio/evidence-repository";
import { listAllFilesForUser, listPortfolioItems } from "@/lib/portfolio/repository";
import { collectAllTags, filterPortfolioItems, hasActivePortfolioFilters, parsePortfolioFilters } from "@/lib/portfolio/search-params";
import { computeProfileStrength, isPortfolioItemIncomplete } from "@/lib/portfolio/strength";
import { createClient } from "@/lib/supabase/server";
import { listVerificationsForUser } from "@/lib/verification/repository";
import type { PortfolioItemType } from "@/types/database";
import type { PortfolioItem } from "@/types/portfolio";

export const metadata: Metadata = {
  title: "My Portfolio — Avela",
};

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="text-xs font-medium tracking-wide text-primary uppercase">
      {children}
    </h2>
  );
}

function fileCountMap(files: { portfolio_item_id: string | null }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const file of files) {
    if (!file.portfolio_item_id) continue;
    counts.set(file.portfolio_item_id, (counts.get(file.portfolio_item_id) ?? 0) + 1);
  }
  return counts;
}

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const filters = parsePortfolioFilters(await searchParams);

  const [allItems, files, linkedItemIds, verificationByItemId] = await Promise.all([
    listPortfolioItems(supabase, profile.id, { includeArchived: filters.includeArchived }),
    listAllFilesForUser(supabase, profile.id),
    listLinkedItemIdsForUser(supabase, profile.id),
    listVerificationsForUser(supabase, profile.id),
  ]);
  const verificationLevelByItemId = new Map([...verificationByItemId].map(([itemId, v]) => [itemId, v.verification_level]));

  const visibleItems = allItems.filter((item) => item.visibility === "visible");
  const fileCountByItemId = fileCountMap(files);
  const strength = computeProfileStrength({ items: visibleItems, fileCountByItemId, linkedItemIds, verificationLevelByItemId });
  const availableTags = collectAllTags(allItems);

  const filtered = filterPortfolioItems(allItems, filters, verificationLevelByItemId);

  if (allItems.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col px-6 py-10 sm:py-12">
        <PageHeader />
        <div className="animate-fade-up mt-8">
          <EmptyState
            icon={FolderOpen}
            title="Your portfolio is empty."
            description="Add your first activity, award, project, or anything else you can document — you'll be able to reuse it across applications."
            className="items-center text-center"
          />
          <div className="mt-4 flex justify-center">
            <AddItemPanel />
          </div>
        </div>
      </div>
    );
  }

  const recent = [...filtered].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 6);
  const incomplete = filtered.filter(isPortfolioItemIncomplete);

  const byType = new Map<PortfolioItemType, PortfolioItem[]>();
  for (const item of filtered) {
    const existing = byType.get(item.item_type) ?? [];
    existing.push(item);
    byType.set(item.item_type, existing);
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-6 py-10 sm:py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader />
        <AddItemPanel />
      </div>

      <section aria-labelledby="strength-heading" className="animate-fade-up mt-8">
        <SectionHeading id="strength-heading">Profile strength</SectionHeading>
        <div className="mt-3 rounded-md border border-border bg-card px-5 py-4">
          <ProfileStrengthMeter strength={strength} />
        </div>
      </section>

      <section aria-labelledby="search-heading" className="animate-fade-up mt-8">
        <h2 id="search-heading" className="sr-only">
          Search and filter
        </h2>
        <PortfolioFilterForm filters={filters} availableTags={availableTags} />
      </section>

      {incomplete.length > 0 && (
        <section aria-labelledby="incomplete-heading" className="animate-fade-up mt-8">
          <SectionHeading id="incomplete-heading">Needs a few more details</SectionHeading>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {incomplete.map((item) => (
              <PortfolioItemCard key={item.id} item={item} fileCount={fileCountByItemId.get(item.id) ?? 0} verificationLevel={verificationLevelByItemId.get(item.id)} />
            ))}
          </div>
        </section>
      )}

      {!hasActivePortfolioFilters(filters) && recent.length > 0 && (
        <section aria-labelledby="recent-heading" className="animate-fade-up mt-8">
          <SectionHeading id="recent-heading">Recently added</SectionHeading>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {recent.map((item) => (
              <PortfolioItemCard key={item.id} item={item} fileCount={fileCountByItemId.get(item.id) ?? 0} verificationLevel={verificationLevelByItemId.get(item.id)} />
            ))}
          </div>
        </section>
      )}

      {filtered.length === 0 ? (
        <p className="animate-fade-up mt-8 text-sm text-muted-foreground">No items match your search.</p>
      ) : (
        [...byType.entries()].map(([itemType, items]) => (
          <section key={itemType} aria-labelledby={`type-${itemType}-heading`} className="animate-fade-up mt-8">
            <div className="flex items-center gap-2">
              <ItemTypeBadge itemType={itemType} />
              <h2 id={`type-${itemType}-heading`} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {items.length} {items.length === 1 ? "item" : "items"}
              </h2>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {items.map((item) => (
                <PortfolioItemCard key={item.id} item={item} fileCount={fileCountByItemId.get(item.id) ?? 0} verificationLevel={verificationLevelByItemId.get(item.id)} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function PageHeader() {
  return (
    <div className="stagger-children">
      <p className="animate-fade-up mb-3 text-xs font-medium tracking-wide text-primary uppercase">Portfolio</p>
      <h1 className="animate-fade-up font-heading text-3xl text-foreground sm:text-4xl">Your evidence vault.</h1>
      <p className="animate-fade-up mt-3 max-w-lg text-base leading-relaxed text-text-secondary">
        A private place to collect everything you&apos;ve done — activities, awards, projects, and more — so you can reuse it across
        every application.
      </p>
    </div>
  );
}

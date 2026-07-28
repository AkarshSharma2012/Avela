/**
 * Search/filter over an already-loaded list of portfolio items — a
 * student's own portfolio is small (dozens of items at most, never a
 * paginated catalog like opportunities), so filtering in memory after one
 * fetch is simpler and just as fast as building a Postgres filter query,
 * with no pagination logic to keep in sync.
 */

import { PORTFOLIO_ITEM_TYPES } from "@/lib/portfolio/constants";
import { VERIFICATION_LEVELS } from "@/lib/verification/constants";
import type { PortfolioItemType, PortfolioVerificationLevel } from "@/types/database";
import type { PortfolioItem } from "@/types/portfolio";

export type PortfolioFilters = {
  q: string;
  itemTypes: PortfolioItemType[];
  tag: string | null;
  includeArchived: boolean;
  /** null = no filter. Never hides unverified items by default — see filterPortfolioItems (spec section 5: "do not hide unverified entries"). */
  verificationLevel: PortfolioVerificationLevel | null;
};

export const EMPTY_PORTFOLIO_FILTERS: PortfolioFilters = {
  q: "",
  itemTypes: [],
  tag: null,
  includeArchived: false,
  verificationLevel: null,
};

export type RawSearchParams = Record<string, string | string[] | undefined>;

function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

const ITEM_TYPE_VALUES = new Set(PORTFOLIO_ITEM_TYPES.map((option) => option.value));
const VERIFICATION_LEVEL_VALUES = new Set(VERIFICATION_LEVELS.map((option) => option.value));

/** Unknown/malformed query params are silently dropped rather than throwing — a bad or stale URL should degrade to "no filter," not a 500. */
export function parsePortfolioFilters(raw: RawSearchParams): PortfolioFilters {
  const q = (Array.isArray(raw.q) ? raw.q[0] : raw.q)?.trim() ?? "";

  const itemTypes = toArray(raw.type).filter((value): value is PortfolioItemType =>
    ITEM_TYPE_VALUES.has(value as PortfolioItemType)
  );

  const tagRaw = Array.isArray(raw.tag) ? raw.tag[0] : raw.tag;
  const tag = tagRaw && tagRaw.trim().length > 0 ? tagRaw.trim() : null;

  const includeArchived = (Array.isArray(raw.archived) ? raw.archived[0] : raw.archived) === "true";

  const verifyRaw = Array.isArray(raw.verify) ? raw.verify[0] : raw.verify;
  const verificationLevel = verifyRaw && VERIFICATION_LEVEL_VALUES.has(verifyRaw as PortfolioVerificationLevel) ? (verifyRaw as PortfolioVerificationLevel) : null;

  return { q, itemTypes, tag, includeArchived, verificationLevel };
}

export function hasActivePortfolioFilters(filters: PortfolioFilters): boolean {
  return filters.q !== "" || filters.itemTypes.length > 0 || filters.tag !== null || filters.verificationLevel !== null;
}

function matchesQuery(item: PortfolioItem, q: string): boolean {
  if (q === "") return true;
  const haystack = [item.title, item.organization ?? "", item.description ?? "", item.outcome ?? "", ...item.skills, ...item.tags]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q.toLowerCase());
}

/**
 * `verificationLevelByItemId` is optional and only ever *filters* — an item
 * with no entry is treated as `unverified`, same as everywhere else in the
 * verification layer, and never dropped just because it lacks a record
 * (spec section 5: "do not hide unverified entries" applies to filtering
 * too — passing no filter, or filtering *for* `unverified`, still shows
 * them; only filtering for a *different* level hides them, same as any
 * other filter).
 */
export function filterPortfolioItems(
  items: readonly PortfolioItem[],
  filters: PortfolioFilters,
  verificationLevelByItemId?: ReadonlyMap<string, PortfolioVerificationLevel>
): PortfolioItem[] {
  return items.filter((item) => {
    if (filters.itemTypes.length > 0 && !filters.itemTypes.includes(item.item_type)) return false;
    if (filters.tag && !item.tags.some((tag) => tag.toLowerCase() === filters.tag?.toLowerCase())) return false;
    if (!matchesQuery(item, filters.q)) return false;
    if (filters.verificationLevel) {
      const level = verificationLevelByItemId?.get(item.id) ?? "unverified";
      if (level !== filters.verificationLevel) return false;
    }
    return true;
  });
}

/** Every distinct tag currently in use, for the filter control — always derived from the student's own items, never a fixed global list, since tags are free text. */
export function collectAllTags(items: readonly PortfolioItem[]): string[] {
  const tags = new Set<string>();
  for (const item of items) {
    for (const tag of item.tags) tags.add(tag);
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

/**
 * Dependency-free portfolio-item mutation logic, separated from actions.ts
 * (the "use server" entry point) and repository.ts (the Supabase queries) —
 * same split as applications/plan.ts and applications/tasks.ts. Identity
 * always comes from an already-resolved session user id, never a
 * client-supplied one.
 */

import { normalizeGithubUsername } from "@/lib/osint/github-identity";
import {
  normalizeSkills,
  normalizeTags,
  validateGithubUsername,
  validateHoursPerWeek,
  validateItemCurrentEnd,
  validateItemDateRange,
  validateItemDescription,
  validateItemOrganization,
  validateItemOutcome,
  validateItemRole,
  validateItemTitle,
  validateItemUrl,
  validateWeeksPerYear,
} from "@/lib/portfolio/validation";
import type { PortfolioItemType, PortfolioItemVisibility } from "@/types/database";

export type ItemMutationResult = { success: true } | { success: false; error: string };
export type ItemCreateResult = { success: true; itemId: string } | { success: false; error: string };

export type PortfolioItemFields = {
  itemType: PortfolioItemType;
  title: string;
  organization?: string | null;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean;
  hoursPerWeek?: number | null;
  weeksPerYear?: number | null;
  role?: string | null;
  outcome?: string | null;
  skills?: string[];
  tags?: string[];
  url?: string | null;
  /** Connected GitHub identity for this item's repository (any format github-identity.ts accepts) — normalized before it's ever stored. */
  githubUsername?: string | null;
};

export type UpdatePortfolioItemInput = Partial<PortfolioItemFields> & {
  visibility?: PortfolioItemVisibility;
};

/** Runs every field validator that applies to whichever fields are actually present in the input — used identically by create (everything present) and update (only the changed fields). */
function validateItemFields(input: Partial<PortfolioItemFields>): string | null {
  if (input.title !== undefined) {
    const error = validateItemTitle(input.title);
    if (error) return error;
  }
  if (input.organization !== undefined) {
    const error = validateItemOrganization(input.organization);
    if (error) return error;
  }
  if (input.description !== undefined) {
    const error = validateItemDescription(input.description);
    if (error) return error;
  }
  if (input.role !== undefined) {
    const error = validateItemRole(input.role);
    if (error) return error;
  }
  if (input.outcome !== undefined) {
    const error = validateItemOutcome(input.outcome);
    if (error) return error;
  }
  if (input.url !== undefined) {
    const error = validateItemUrl(input.url ?? null);
    if (error) return error;
  }
  if (input.githubUsername !== undefined) {
    const error = validateGithubUsername(input.githubUsername ?? null);
    if (error) return error;
  }
  if (input.hoursPerWeek !== undefined) {
    const error = validateHoursPerWeek(input.hoursPerWeek);
    if (error) return error;
  }
  if (input.weeksPerYear !== undefined) {
    const error = validateWeeksPerYear(input.weeksPerYear);
    if (error) return error;
  }
  if (input.startDate !== undefined || input.endDate !== undefined) {
    const startDate = input.startDate ?? null;
    const endDate = input.endDate ?? null;
    const rangeError = validateItemDateRange(startDate, endDate);
    if (rangeError) return rangeError;
  }
  if (input.isCurrent !== undefined || input.endDate !== undefined) {
    const isCurrent = input.isCurrent ?? false;
    const endDate = input.endDate ?? null;
    const currentError = validateItemCurrentEnd(isCurrent, endDate);
    if (currentError) return currentError;
  }
  return null;
}

/** Normalizes skills/tags in place (trim, dedupe, cap) — never rejects on a messy list, just cleans it up, since these are low-stakes free-text entries a student is expected to type quickly. */
function normalizeItemFields<T extends Partial<PortfolioItemFields>>(input: T): T {
  const next = { ...input };
  if (next.skills !== undefined) next.skills = normalizeSkills(next.skills);
  if (next.tags !== undefined) next.tags = normalizeTags(next.tags);
  if (next.title !== undefined) next.title = next.title.trim();
  if (next.githubUsername !== undefined) next.githubUsername = normalizeGithubUsername(next.githubUsername);
  return next;
}

export type CreateItemFn = (userId: string, input: PortfolioItemFields) => Promise<{ itemId: string | null; error: string | null }>;

export async function createPortfolioItemForUser(
  userId: string | null,
  input: PortfolioItemFields,
  create: CreateItemFn
): Promise<ItemCreateResult> {
  if (userId === null) {
    return { success: false, error: "You need to be signed in to add a portfolio item." };
  }

  const fieldError = validateItemFields(input);
  if (fieldError) return { success: false, error: fieldError };

  const normalized = normalizeItemFields(input);
  const { itemId, error } = await create(userId, normalized);
  if (error || itemId === null) {
    console.error("[portfolio] failed to create portfolio item:", error);
    return { success: false, error: "Couldn't save that item. Please try again." };
  }

  return { success: true, itemId };
}

export type WriteItemFn = (
  userId: string,
  itemId: string,
  patch: UpdatePortfolioItemInput
) => Promise<{ error: string | null }>;

export async function updatePortfolioItemForUser(
  userId: string | null,
  itemId: string,
  input: UpdatePortfolioItemInput,
  write: WriteItemFn
): Promise<ItemMutationResult> {
  if (userId === null) {
    return { success: false, error: "You need to be signed in to edit this item." };
  }

  const fieldError = validateItemFields(input);
  if (fieldError) return { success: false, error: fieldError };

  const normalized = normalizeItemFields(input);
  const { error } = await write(userId, itemId, normalized);
  if (error) {
    console.error("[portfolio] failed to update portfolio item:", error);
    return { success: false, error: "Couldn't save your changes. Please try again." };
  }

  return { success: true };
}

export type SetVisibilityFn = (
  userId: string,
  itemId: string,
  visibility: PortfolioItemVisibility
) => Promise<{ error: string | null }>;

/** Archive/unarchive — the "hide" action from the spec. Never a delete: an archived item still exists, still keeps any evidence links, and can be restored. */
export async function setPortfolioItemVisibilityForUser(
  userId: string | null,
  itemId: string,
  visibility: PortfolioItemVisibility,
  write: SetVisibilityFn
): Promise<ItemMutationResult> {
  if (userId === null) {
    return { success: false, error: "You need to be signed in to update this item." };
  }

  const { error } = await write(userId, itemId, visibility);
  if (error) {
    console.error("[portfolio] failed to update portfolio item visibility:", error);
    return { success: false, error: "Couldn't update that item. Please try again." };
  }

  return { success: true };
}

export type RemoveItemFn = (userId: string, itemId: string) => Promise<{ error: string | null }>;

export async function deletePortfolioItemForUser(
  userId: string | null,
  itemId: string,
  remove: RemoveItemFn
): Promise<ItemMutationResult> {
  if (userId === null) {
    return { success: false, error: "You need to be signed in to remove this item." };
  }

  const { error } = await remove(userId, itemId);
  if (error) {
    console.error("[portfolio] failed to delete portfolio item:", error);
    return { success: false, error: "Couldn't remove this item. Please try again." };
  }

  return { success: true };
}

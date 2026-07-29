/**
 * Dependency-free portfolio-item field validation — no Supabase import, so
 * every rule here is unit-testable without mocking anything. Mirrors the
 * fixed limits in the migration's own check constraints; both must be kept
 * in sync by hand (same convention as applications/tasks.ts's
 * MAX_TITLE_LENGTH).
 */

import { normalizeGithubUsername } from "@/lib/osint/github-identity";

export const MAX_TITLE_LENGTH = 200;
export const MAX_ORGANIZATION_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 5000;
export const MAX_ROLE_LENGTH = 200;
export const MAX_OUTCOME_LENGTH = 2000;
export const MAX_URL_LENGTH = 2000;
export const MAX_EVIDENCE_NOTES_LENGTH = 1000;
export const MAX_TAG_LENGTH = 40;
export const MAX_TAGS = 20;
export const MAX_SKILLS = 20;
export const MAX_HOURS_PER_WEEK = 168;
export const MAX_WEEKS_PER_YEAR = 52;
export const MAX_ACTIVITY_CATEGORY_KEY_LENGTH = 100;

export function validateItemTitle(title: string): string | null {
  if (title.trim().length === 0) return "Give this item a title.";
  if (title.length > MAX_TITLE_LENGTH) return "Title is too long.";
  return null;
}

export function validateItemOrganization(organization: string | null): string | null {
  if (organization !== null && organization.length > MAX_ORGANIZATION_LENGTH) {
    return "Organization name is too long.";
  }
  return null;
}

export function validateItemDescription(description: string | null): string | null {
  if (description !== null && description.length > MAX_DESCRIPTION_LENGTH) {
    return "Description is too long.";
  }
  return null;
}

export function validateItemRole(role: string | null): string | null {
  if (role !== null && role.length > MAX_ROLE_LENGTH) return "Role is too long.";
  return null;
}

/** Outcome is always the student's own factual account — this only bounds length; it never judges or rewrites what's written. */
export function validateItemOutcome(outcome: string | null): string | null {
  if (outcome !== null && outcome.length > MAX_OUTCOME_LENGTH) return "Outcome is too long.";
  return null;
}

/** Accepts any of the formats github-identity.ts normalizes (bare username, @username, a github.com URL) — only rejects text that doesn't resolve to a valid GitHub username at all. */
export function validateGithubUsername(githubUsername: string | null): string | null {
  if (githubUsername === null || githubUsername.trim().length === 0) return null;
  if (normalizeGithubUsername(githubUsername) === null) {
    return "That doesn't look like a valid GitHub username or profile link.";
  }
  return null;
}

export function validateItemUrl(url: string | null): string | null {
  if (url === null || url.trim().length === 0) return null;
  if (url.length > MAX_URL_LENGTH) return "That link is too long.";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "That doesn't look like a valid link.";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "Links must start with http:// or https://.";
  }
  return null;
}

export function validateItemDateRange(startDate: string | null, endDate: string | null): string | null {
  if (startDate === null || endDate === null) return null;
  if (new Date(endDate).getTime() < new Date(startDate).getTime()) {
    return "End date can't be before the start date.";
  }
  return null;
}

/** Mirrors the migration's portfolio_items_current_no_end constraint — "still doing this" and a fixed end date can't both be true. */
export function validateItemCurrentEnd(isCurrent: boolean, endDate: string | null): string | null {
  if (isCurrent && endDate !== null) {
    return 'Clear the end date, or turn off "still doing this" first.';
  }
  return null;
}

export function validateHoursPerWeek(hoursPerWeek: number | null): string | null {
  if (hoursPerWeek === null) return null;
  if (!Number.isFinite(hoursPerWeek) || hoursPerWeek < 0 || hoursPerWeek > MAX_HOURS_PER_WEEK) {
    return `Hours per week must be between 0 and ${MAX_HOURS_PER_WEEK}.`;
  }
  return null;
}

export function validateWeeksPerYear(weeksPerYear: number | null): string | null {
  if (weeksPerYear === null) return null;
  if (!Number.isFinite(weeksPerYear) || weeksPerYear < 0 || weeksPerYear > MAX_WEEKS_PER_YEAR) {
    return `Weeks per year must be between 0 and ${MAX_WEEKS_PER_YEAR}.`;
  }
  return null;
}

export function validateEvidenceNotes(notes: string | null): string | null {
  if (notes !== null && notes.length > MAX_EVIDENCE_NOTES_LENGTH) return "Notes are too long.";
  return null;
}

/** Never rejects an unrecognized key — taxonomy.ts's resolveCategory() always falls back safely at read time. This only guards the migration's length bound so a save never hits a raw DB error. */
export function validateActivityCategoryKey(activityCategoryKey: string | null): string | null {
  if (activityCategoryKey !== null && activityCategoryKey.length > MAX_ACTIVITY_CATEGORY_KEY_LENGTH) {
    return "That category key is too long.";
  }
  return null;
}

/**
 * Trims, drops empties/over-length entries, and de-duplicates
 * case-insensitively, capped at a fixed count — used for both `skills` and
 * `tags`, which share the same shape and the same reason to bound them
 * (an unbounded array is both a bad UI and an easy way to blow past the
 * column's practical size).
 */
export function normalizeStringList(values: readonly string[], maxItems: number, maxLength: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (value.length === 0 || value.length > maxLength) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= maxItems) break;
  }
  return result;
}

export function normalizeSkills(skills: readonly string[]): string[] {
  return normalizeStringList(skills, MAX_SKILLS, MAX_TAG_LENGTH);
}

export function normalizeTags(tags: readonly string[]): string[] {
  return normalizeStringList(tags, MAX_TAGS, MAX_TAG_LENGTH);
}

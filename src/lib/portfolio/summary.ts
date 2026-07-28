/**
 * Turns a structured portfolio item into a concise, resume-ready summary —
 * factual only, built exclusively from fields the student actually filled
 * in. Never invents an achievement, never upgrades "helped organize" into
 * "led," and never writes a full essay — this produces a short factual
 * sentence plus a list of which relevant fields are still empty, so the
 * gap is visible instead of silently papered over. The student can always
 * edit the underlying item (and therefore this summary) from the item
 * workspace page.
 */

import type { PortfolioItem } from "@/types/portfolio";
import type { PortfolioItemType } from "@/types/database";

export type ResumeSummaryResult = {
  summary: string;
  missingFields: string[];
};

export type ExpectedField = "organization" | "role" | "dates" | "outcome" | "skills";

/** Which fields are typically relevant for each item type — used only to decide what to list as "missing," never to invent a value. */
const EXPECTED_FIELDS_BY_TYPE: Record<PortfolioItemType, readonly ExpectedField[]> = {
  activity: ["organization", "role", "dates", "outcome"],
  award: ["organization", "dates", "outcome"],
  project: ["role", "dates", "outcome", "skills"],
  leadership: ["organization", "role", "dates", "outcome"],
  volunteer_service: ["organization", "role", "dates", "outcome"],
  work_experience: ["organization", "role", "dates", "outcome"],
  course: ["organization", "dates"],
  certification: ["organization", "dates"],
  skill: ["outcome"],
  essay_response: ["outcome"],
  recommendation_contact: ["organization", "role"],
  document: [],
  link: [],
  custom: ["organization", "dates", "outcome"],
};

/** Which fields are worth showing on a completeness checklist for this item type — used by components/portfolio/completeness-checklist.tsx so it never asks for a field that was never relevant in the first place. */
export function getExpectedFields(itemType: PortfolioItemType): readonly ExpectedField[] {
  return EXPECTED_FIELDS_BY_TYPE[itemType];
}

function formatMonthYear(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function formatDateRange(item: PortfolioItem): string | null {
  const start = item.start_date ? formatMonthYear(item.start_date) : null;
  const end = item.is_current ? "present" : item.end_date ? formatMonthYear(item.end_date) : null;
  if (start && end) return `${start}–${end}`;
  if (start) return `Since ${start}`;
  if (end) return `Through ${end}`;
  return null;
}

function formatCommitment(item: PortfolioItem): string | null {
  if (item.hours_per_week && item.weeks_per_year) {
    return `${item.hours_per_week} hrs/week, ${item.weeks_per_year} weeks/year`;
  }
  if (item.hours_per_week) return `${item.hours_per_week} hrs/week`;
  if (item.weeks_per_year) return `${item.weeks_per_year} weeks/year`;
  return null;
}

/** The single factual builder every per-type summary function below delegates to — one implementation, not five near-duplicates, since the underlying fields and sentence shape are identical across types. */
export function buildResumeSummary(item: PortfolioItem): ResumeSummaryResult {
  const dateRange = formatDateRange(item);
  const commitment = formatCommitment(item);

  const headline = item.role ? `${item.title} — ${item.role}` : item.title;
  const parts: string[] = [headline];
  if (item.organization) parts.push(`with ${item.organization}`);

  const timing = [dateRange, commitment].filter((value): value is string => value !== null).join(", ");
  if (timing) parts.push(`(${timing})`);

  let summary = parts.join(" ");
  if (item.outcome && item.outcome.trim().length > 0) summary += `. ${item.outcome.trim()}`;
  if (item.skills.length > 0) summary += ` Skills: ${item.skills.join(", ")}.`;

  const expected = EXPECTED_FIELDS_BY_TYPE[item.item_type];
  const missingFields: string[] = [];
  if (expected.includes("organization") && !item.organization) missingFields.push("organization");
  if (expected.includes("role") && !item.role) missingFields.push("role");
  if (expected.includes("dates") && !dateRange) missingFields.push("dates");
  if (expected.includes("outcome") && !(item.outcome && item.outcome.trim().length > 0)) missingFields.push("outcome");
  if (expected.includes("skills") && item.skills.length === 0) missingFields.push("skills");

  return { summary: summary.trim(), missingFields };
}

// Named per-type entry points, per the spec's own examples — all sharing
// the one factual builder above rather than five diverging
// implementations that could drift out of sync with each other.
export function buildActivitySummary(item: PortfolioItem): ResumeSummaryResult {
  return buildResumeSummary(item);
}
export function buildAwardSummary(item: PortfolioItem): ResumeSummaryResult {
  return buildResumeSummary(item);
}
export function buildProjectSummary(item: PortfolioItem): ResumeSummaryResult {
  return buildResumeSummary(item);
}
export function buildVolunteerSummary(item: PortfolioItem): ResumeSummaryResult {
  return buildResumeSummary(item);
}
export function buildLeadershipSummary(item: PortfolioItem): ResumeSummaryResult {
  return buildResumeSummary(item);
}

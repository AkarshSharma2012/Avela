import type {
  OpportunityCostType,
  OpportunityFormat,
  OpportunityType,
  OpportunityVerificationLabel,
} from "@/types/database";
import type { Opportunity } from "@/types/opportunity";

/**
 * Internal-only catalog coverage reporting (Milestone 7 spec section 10)
 * — surfaces gaps like "no business programs" or "no Grade 8 options" to
 * whoever runs `npm run opportunities:coverage`. Never shown to students
 * (no route/component reads this) — "Do not display fake analytics to
 * students" per the spec. Kept as a pure function over an already-fetched
 * opportunity list (not a Supabase client) so it's unit-testable the same
 * way as every other engine in this codebase.
 */

export type CoverageReport = {
  total: number;
  byType: Partial<Record<OpportunityType, number>>;
  byInterestTag: Record<string, number>;
  byGrade: Record<number, number>;
  byFormat: Partial<Record<OpportunityFormat, number>>;
  byCost: Partial<Record<OpportunityCostType, number>>;
  byVerificationLabel: Partial<Record<OpportunityVerificationLabel, number>>;
  /** Plain-language gaps worth a human's attention — not a score, not shown to students. */
  gaps: string[];
};

const ALL_GRADES = [6, 7, 8, 9, 10, 11, 12];

function increment<K extends string | number>(map: Record<K, number>, key: K): void {
  map[key] = (map[key] ?? 0) + 1;
}

export function computeCoverageReport(opportunities: readonly Opportunity[]): CoverageReport {
  const byType: Partial<Record<OpportunityType, number>> = {};
  const byInterestTag: Record<string, number> = {};
  const byGrade: Record<number, number> = Object.fromEntries(ALL_GRADES.map((g) => [g, 0]));
  const byFormat: Partial<Record<OpportunityFormat, number>> = {};
  const byCost: Partial<Record<OpportunityCostType, number>> = {};
  const byVerificationLabel: Partial<Record<OpportunityVerificationLabel, number>> = {};

  for (const opportunity of opportunities) {
    increment(byType as Record<OpportunityType, number>, opportunity.opportunity_type);
    increment(byFormat as Record<OpportunityFormat, number>, opportunity.format);
    increment(byCost as Record<OpportunityCostType, number>, opportunity.cost_type);
    increment(
      byVerificationLabel as Record<OpportunityVerificationLabel, number>,
      opportunity.verification_label
    );

    for (const tag of opportunity.interest_tags) {
      byInterestTag[tag] = (byInterestTag[tag] ?? 0) + 1;
    }

    for (const grade of ALL_GRADES) {
      const min = opportunity.min_grade ?? -Infinity;
      const max = opportunity.max_grade ?? Infinity;
      if (grade >= min && grade <= max) byGrade[grade] += 1;
    }
  }

  const gaps: string[] = [];
  const total = opportunities.length;

  if (total === 0) {
    gaps.push("Catalog is empty.");
    return { total, byType, byInterestTag, byGrade, byFormat, byCost, byVerificationLabel, gaps };
  }

  const businessTags = ["Business", "Entrepreneurship", "Finance"];
  if (!businessTags.some((tag) => (byInterestTag[tag] ?? 0) > 0)) {
    gaps.push("No business/entrepreneurship-tagged opportunities.");
  }

  for (const grade of ALL_GRADES) {
    if (byGrade[grade] === 0) gaps.push(`No opportunities open to Grade ${grade} students.`);
  }

  if ((byFormat.virtual ?? 0) === 0) gaps.push("No virtual opportunities.");
  if ((byCost.free ?? 0) === 0) gaps.push("No free opportunities.");

  const stemTags = ["Technology", "Computer Science", "Engineering", "Mathematics", "Environmental Science", "Biology"];
  const stemCount = opportunities.filter((o) => o.interest_tags.some((tag) => stemTags.includes(tag))).length;
  if (total >= 5 && stemCount / total > 0.7) {
    gaps.push(`STEM-tagged opportunities dominate the catalog (${stemCount}/${total}) — consider diversifying categories.`);
  }

  return { total, byType, byInterestTag, byGrade, byFormat, byCost, byVerificationLabel, gaps };
}

/** Renders a `CoverageReport` as a plain-text table for CLI output — no HTML, no student-facing formatting. */
export function formatCoverageReport(report: CoverageReport): string {
  const lines: string[] = [];
  lines.push(`Total opportunities: ${report.total}`);
  lines.push("");
  lines.push("By type:");
  for (const [key, count] of Object.entries(report.byType)) lines.push(`  ${key}: ${count}`);
  lines.push("");
  lines.push("By format:");
  for (const [key, count] of Object.entries(report.byFormat)) lines.push(`  ${key}: ${count}`);
  lines.push("");
  lines.push("By cost:");
  for (const [key, count] of Object.entries(report.byCost)) lines.push(`  ${key}: ${count}`);
  lines.push("");
  lines.push("By grade:");
  for (const [grade, count] of Object.entries(report.byGrade)) lines.push(`  Grade ${grade}: ${count}`);
  lines.push("");
  lines.push("By interest tag:");
  for (const [tag, count] of Object.entries(report.byInterestTag).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${tag}: ${count}`);
  }
  lines.push("");
  lines.push("By verification label:");
  for (const [label, count] of Object.entries(report.byVerificationLabel)) lines.push(`  ${label}: ${count}`);
  lines.push("");
  lines.push("Gaps:");
  if (report.gaps.length === 0) {
    lines.push("  (none flagged)");
  } else {
    for (const gap of report.gaps) lines.push(`  - ${gap}`);
  }
  return lines.join("\n");
}

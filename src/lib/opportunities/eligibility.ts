/**
 * Whether a student's grade level falls within an opportunity's eligible
 * range. Nulls are treated as "no limit on that side" rather than "excludes
 * everyone" — an opportunity with no min_grade is open to any younger
 * student, one with no max_grade is open to any older student, and one with
 * neither set is open to every grade. A student with no grade_level on file
 * (onboarding incomplete or skipped) is treated as eligible for everything,
 * since there's no basis to exclude them yet.
 */
export function isGradeEligible(
  gradeLevel: number | null,
  minGrade: number | null,
  maxGrade: number | null
): boolean {
  if (gradeLevel === null) return true;
  if (minGrade !== null && gradeLevel < minGrade) return false;
  if (maxGrade !== null && gradeLevel > maxGrade) return false;
  return true;
}

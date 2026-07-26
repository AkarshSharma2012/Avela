import type { OpportunityCostType } from "@/types/database";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** Formats an ISO date/timestamp string in UTC, so the displayed day never
 * shifts backward or forward depending on the viewer's local timezone. */
function formatIsoDate(iso: string): string {
  return DATE_FORMATTER.format(new Date(iso));
}

export function isDeadlinePassed(deadline: string | null, now: Date = new Date()): boolean {
  if (deadline === null) return false;
  return new Date(deadline).getTime() < now.getTime();
}

export function formatDeadline(deadline: string | null, now: Date = new Date()): string {
  if (deadline === null) return "Rolling admissions";
  if (isDeadlinePassed(deadline, now)) return "Deadline passed";
  return `Applications due ${formatIsoDate(deadline)}`;
}

export function formatGradeRange(minGrade: number | null, maxGrade: number | null): string {
  if (minGrade === null && maxGrade === null) return "All grades";
  if (minGrade === null) return `Up to grade ${maxGrade}`;
  if (maxGrade === null) return `Grade ${minGrade}+`;
  if (minGrade === maxGrade) return `Grade ${minGrade}`;
  return `Grades ${minGrade}–${maxGrade}`;
}

export function formatCost(
  costType: OpportunityCostType,
  costAmount: number | null
): string {
  if (costType === "free") return "Free";
  if (costAmount === null) return "Paid";
  const hasCents = !Number.isInteger(costAmount);
  return `$${costAmount.toLocaleString("en-US", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export function formatCommitment(
  weeklyCommitmentHours: number | null,
  durationText: string | null
): string {
  const hoursPart = weeklyCommitmentHours !== null ? `${weeklyCommitmentHours} hrs/week` : null;
  const parts = [hoursPart, durationText].filter((part): part is string => Boolean(part));
  if (parts.length === 0) return "Commitment varies";
  return parts.join(" · ");
}

export function formatLocation(
  locationText: string | null,
  remoteAllowed: boolean
): string {
  if (locationText && remoteAllowed) return `${locationText} (remote option)`;
  if (locationText) return locationText;
  if (remoteAllowed) return "Remote";
  return "Location not specified";
}

/** "Last checked <date>" for the verification badge/detail page, or a plain "Not yet checked" when `last_verified_at` is still null (the Milestone 5 column default). */
export function formatLastVerified(lastVerifiedAt: string | null): string {
  if (lastVerifiedAt === null) return "Not yet checked";
  return `Last checked ${formatIsoDate(lastVerifiedAt)}`;
}

/** `null` (never a row) when the requirement is unknown — only rendered when extraction actually found a yes/no answer. See detail-extraction.ts's boolean fields. */
export function formatRequirement(value: boolean | null, label: string): string | null {
  if (value === null) return null;
  return value ? `${label} required` : `${label} not required`;
}

export function formatAgeRange(minAge: number | null, maxAge: number | null): string | null {
  if (minAge === null && maxAge === null) return null;
  if (minAge === null) return `Up to age ${maxAge}`;
  if (maxAge === null) return `Age ${minAge}+`;
  if (minAge === maxAge) return `Age ${minAge}`;
  return `Ages ${minAge}–${maxAge}`;
}

export function formatMoney(amount: number | null): string | null {
  if (amount === null) return null;
  const hasCents = !Number.isInteger(amount);
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export function formatDateRange(
  startDate: string | null,
  endDate: string | null
): string | null {
  if (startDate && endDate) return `${formatIsoDate(startDate)} – ${formatIsoDate(endDate)}`;
  if (startDate) return `Starts ${formatIsoDate(startDate)}`;
  if (endDate) return `Ends ${formatIsoDate(endDate)}`;
  return null;
}

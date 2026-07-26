import { formatGradeRange } from "@/lib/opportunities/format";
import { isGradeEligible } from "@/lib/opportunities/eligibility";
import { WEEKLY_AVAILABILITY_MAX_HOURS } from "@/lib/opportunities/matching";
import type {
  OpportunityApplicationStatus,
  OpportunityDeadlineStatus,
  WeeklyAvailability,
} from "@/types/database";

export type EligibilityStatus = "eligible" | "likely_eligible" | "unclear" | "ineligible";

export type EligibilityResult = {
  status: EligibilityStatus;
  /** Always at least one, transparent, human-readable reason — never a bare status. */
  reasons: string[];
};

export type EligibilityOpportunityInput = {
  minGrade: number | null;
  maxGrade: number | null;
  deadlineStatus: OpportunityDeadlineStatus;
  applicationStatus: OpportunityApplicationStatus;
  /** Short region text (e.g. "Washington"), already normalized — see normalization.ts's normalizeResidencyRequirement. `null` means no residency restriction is known. */
  residencyRequirements: string | null;
  /** Short requirement text (e.g. "U.S. citizen", "None"), already normalized — see normalizeCitizenshipRequirement. `null` means unknown/not specified. */
  citizenshipRequirements: string | null;
  weeklyCommitmentHours: number | null;
};

export type EligibilityStudentInput = {
  gradeLevel: number | null;
  state: string | null;
  weeklyAvailability: WeeklyAvailability | null;
};

const STATUS_RANK: Record<EligibilityStatus, number> = {
  eligible: 0,
  likely_eligible: 1,
  unclear: 2,
  ineligible: 3,
};

function worstOf(a: EligibilityStatus, b: EligibilityStatus): EligibilityStatus {
  return STATUS_RANK[b] > STATUS_RANK[a] ? b : a;
}

/**
 * This engine answers "can this student apply at all" (eligibility),
 * distinct from `matching.ts`'s "how well does this fit their profile"
 * (preference-based tiering). The two are deliberately separate — the
 * ranking spec (section 9) treats "eligible and accepting applications" and
 * "strong profile alignment" as different priority tiers, and conflating
 * them would let a great preference match paper over a hard eligibility
 * problem. See docs/decision-log.md.
 *
 * Experience level and age limits are not evaluated here for the same
 * reason `matching.ts` never scored experience level: neither `profiles`
 * nor `opportunities` has a real backing column for either yet, and
 * fabricating a signal from unrelated fields would violate "do not hide
 * uncertainty" by pretending to a certainty that doesn't exist. Cost and
 * format are preference signals (handled by `matching.ts`), not eligibility
 * gates — nothing about being unable to afford or dislike a format actually
 * prevents a student from applying.
 *
 * Citizenship is always capped at `unclear` when a requirement exists
 * (never fully `eligible`), because `profiles` only stores `country`, not
 * citizenship/visa status — country alone cannot confirm citizenship, so
 * pretending otherwise would hide real uncertainty from the student.
 */
export function evaluateEligibility(
  opportunity: EligibilityOpportunityInput,
  student: EligibilityStudentInput
): EligibilityResult {
  // --- Hard exclusions (spec section 6) ---------------------------------
  const hardReasons: string[] = [];

  if (!isGradeEligible(student.gradeLevel, opportunity.minGrade, opportunity.maxGrade)) {
    hardReasons.push(
      `Outside your grade level (opens for ${formatGradeRange(opportunity.minGrade, opportunity.maxGrade)})`
    );
  }

  if (opportunity.deadlineStatus === "closed") {
    hardReasons.push("Deadline has passed.");
  }

  if (opportunity.applicationStatus === "closed") {
    hardReasons.push("Applications are closed.");
  }

  const residency = evaluateResidency(opportunity.residencyRequirements, student.state);
  if (residency.outcome === "mismatch") {
    hardReasons.push(`Requires ${residency.region} residency.`);
  }

  if (hardReasons.length > 0) {
    return { status: "ineligible", reasons: hardReasons };
  }

  // --- Soft signals -------------------------------------------------------
  let status: EligibilityStatus = "eligible";
  const reasons: string[] = [];

  if (
    student.gradeLevel !== null &&
    (opportunity.minGrade !== null || opportunity.maxGrade !== null)
  ) {
    reasons.push(`Open to grade ${student.gradeLevel} students`);
  }

  if (residency.outcome === "unknown_location") {
    status = worstOf(status, "unclear");
    reasons.push(`Requires ${residency.region} residency — add your location to confirm.`);
  } else if (residency.outcome === "match") {
    reasons.push(`Meets the ${residency.region} residency requirement.`);
  }

  if (opportunity.citizenshipRequirements && !/\bnone\b/i.test(opportunity.citizenshipRequirements)) {
    status = worstOf(status, "unclear");
    reasons.push("Citizenship requirement is unclear.");
  }

  if (opportunity.weeklyCommitmentHours !== null && student.weeklyAvailability !== null) {
    const maxHours = WEEKLY_AVAILABILITY_MAX_HOURS[student.weeklyAvailability];
    if (maxHours !== null) {
      if (opportunity.weeklyCommitmentHours > maxHours) {
        status = worstOf(status, "likely_eligible");
        reasons.push("Weekly commitment exceeds your availability.");
      } else {
        reasons.push("Fits your weekly availability.");
      }
    }
  }

  if (reasons.length === 0) {
    reasons.push("No eligibility restrictions found for this opportunity.");
  }

  return { status, reasons };
}

type ResidencyEvaluation =
  | { outcome: "not_applicable" }
  | { outcome: "match"; region: string }
  | { outcome: "mismatch"; region: string }
  | { outcome: "unknown_location"; region: string };

/** State-name/abbreviation matching is intentionally loose (case-insensitive substring) — residency text is free-form, normalized best-effort by normalization.ts. */
function evaluateResidency(
  residencyRequirement: string | null,
  studentState: string | null
): ResidencyEvaluation {
  if (!residencyRequirement) return { outcome: "not_applicable" };
  if (/united states/i.test(residencyRequirement)) return { outcome: "not_applicable" };

  if (!studentState) return { outcome: "unknown_location", region: residencyRequirement };

  const matches = studentState.toLowerCase().includes(residencyRequirement.toLowerCase()) ||
    residencyRequirement.toLowerCase().includes(studentState.toLowerCase());

  return matches
    ? { outcome: "match", region: residencyRequirement }
    : { outcome: "mismatch", region: residencyRequirement };
}

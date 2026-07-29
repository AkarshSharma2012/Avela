/**
 * Team-project fields (spec section 12) — team size, the student's own
 * role, and personal contribution kept structurally separate from overall
 * team output, plus an optional collaborator list. Nothing here is ever
 * required to save: a student who leaves every field blank still saves
 * successfully (hard constraint — never block portfolio creation when
 * detail is skipped), and no field here ever implies sole authorship on
 * its own. "Team output does not confirm individual contribution" is
 * enforced by keeping the two as separate columns/inputs everywhere, never
 * by inferring one from the other.
 */

const MAX_ROLE_LENGTH = 200;
const MAX_LONG_ANSWER_LENGTH = 2000;
const MAX_COLLABORATOR_NAME_LENGTH = 200;
const MAX_COLLABORATOR_EMAIL_LENGTH = 320;
const MIN_TEAM_SIZE = 1;
const MAX_TEAM_SIZE = 1000;

export type TeamDetailsInput = {
  teamSize?: number | null;
  studentRole?: string | null;
  teamOutput?: string | null;
  personalContribution?: string | null;
};

export type TeamDetailsValidationResult = { valid: true } | { valid: false; error: string };

/** Every field here is optional — validation only ever rejects an out-of-range or too-long value, never a missing one. */
export function validateTeamDetailsInput(input: TeamDetailsInput): TeamDetailsValidationResult {
  if (input.teamSize !== undefined && input.teamSize !== null) {
    if (!Number.isInteger(input.teamSize) || input.teamSize < MIN_TEAM_SIZE || input.teamSize > MAX_TEAM_SIZE) {
      return { valid: false, error: "Team size should be a whole number." };
    }
  }
  if (input.studentRole && input.studentRole.length > MAX_ROLE_LENGTH) {
    return { valid: false, error: "That role description is a bit long — try trimming it down." };
  }
  if (input.teamOutput && input.teamOutput.length > MAX_LONG_ANSWER_LENGTH) {
    return { valid: false, error: "That description is a bit long — try trimming it down." };
  }
  if (input.personalContribution && input.personalContribution.length > MAX_LONG_ANSWER_LENGTH) {
    return { valid: false, error: "That description is a bit long — try trimming it down." };
  }
  return { valid: true };
}

export type TeamCollaboratorInput = {
  name: string;
  /** Never required — spec section 12: "no collaborator email required for basic use." */
  email?: string | null;
  role?: string | null;
};

export type TeamCollaboratorValidationResult = { valid: true } | { valid: false; error: string };

export function validateTeamCollaboratorInput(input: TeamCollaboratorInput): TeamCollaboratorValidationResult {
  if (input.name.trim().length === 0) {
    return { valid: false, error: "Add a name for this collaborator, or remove the row." };
  }
  if (input.name.length > MAX_COLLABORATOR_NAME_LENGTH) {
    return { valid: false, error: "That name is a bit long — try trimming it down." };
  }
  if (input.email && input.email.length > MAX_COLLABORATOR_EMAIL_LENGTH) {
    return { valid: false, error: "That email is a bit long." };
  }
  if (input.role && input.role.length > MAX_ROLE_LENGTH) {
    return { valid: false, error: "That role description is a bit long — try trimming it down." };
  }
  return { valid: true };
}

/**
 * Whether an item's recorded contribution detail is specific enough to
 * distinguish personal work from team output — a pure display hint (spec
 * section 12: "one small contribution does not prove sole creation," "no
 * sole-creator status without support"). Never used to gate saving, never
 * used to grant or withhold profile-strength credit by itself — see
 * strength.ts, which reads none of this.
 */
export function hasDistinctPersonalContribution(input: Pick<TeamDetailsInput, "teamOutput" | "personalContribution">): boolean {
  const personal = input.personalContribution?.trim() ?? "";
  const team = input.teamOutput?.trim() ?? "";
  if (personal.length === 0) return false;
  return personal !== team;
}

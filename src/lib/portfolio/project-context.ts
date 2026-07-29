/**
 * Project context (Milestone 10.8, spec section 2) — what kind of setting an
 * activity happened in, driving which fields are shown/required. Widens the
 * Milestone 10.7 project_context column (see
 * 20260813000000_activity_taxonomy_and_project_context.sql) rather than
 * replacing it: 'org_linked' stays a permanent, valid synonym of
 * 'organization_project'.
 *
 * Hard rule enforced here structurally, not just documented: no context ever
 * requires evidence or a connected account. `organizationRequired` only ever
 * governs whether the organization *field* is shown as required — it never
 * gates saving, and evidence/verification stay optional for every context
 * (spec: "never require public evidence," "never block portfolio creation
 * or applications when verification is skipped").
 */

import type { PortfolioItemProjectContext } from "@/types/database";

export const PROJECT_CONTEXTS: readonly { value: PortfolioItemProjectContext; label: string }[] = [
  { value: "personal_project", label: "Personal project" },
  { value: "organization_project", label: "Organization project" },
  { value: "school_project", label: "School project" },
  { value: "team_project", label: "Team project" },
  { value: "family_or_household", label: "Family or household" },
  { value: "community_project", label: "Community project" },
  { value: "employment", label: "Employment" },
  { value: "competition", label: "Competition" },
  { value: "course_or_program", label: "Course or program" },
  { value: "independent_activity", label: "Independent activity" },
  { value: "custom", label: "Something else" },
];

export const PROJECT_CONTEXT_LABELS: Record<PortfolioItemProjectContext, string> = {
  ...Object.fromEntries(PROJECT_CONTEXTS.map((option) => [option.value, option.label])),
  // Legacy Milestone 10.7 value — never shown as a selectable option going
  // forward (organization_project replaces it in the UI), but must still
  // resolve to a sensible label for any pre-existing item that has it.
  org_linked: "Organization project",
} as Record<PortfolioItemProjectContext, string>;

/** Treats the legacy 'org_linked' value as 'organization_project' everywhere except the stored column itself. */
export function normalizeProjectContext(
  context: PortfolioItemProjectContext | null | undefined
): Exclude<PortfolioItemProjectContext, "org_linked"> | null {
  if (!context) return null;
  return context === "org_linked" ? "organization_project" : context;
}

export type ProjectContextFieldVisibility = {
  /** UI hint only — the organization field is shown as required. Never blocks saving without one. */
  organizationRequired: boolean;
  /** Team-specific fields (team size, personal contribution vs. team output, collaborators). */
  showTeamFields: boolean;
  /** Paid-work-specific fields (employer, compensation context) shown only when relevant. */
  showEmploymentFields: boolean;
  /** A gentle nudge, never a requirement — school work may offer teacher confirmation as a support method. */
  suggestTeacherConfirmation: boolean;
  /** Competition claims may offer an official result page as a support method. */
  suggestOfficialResultLink: boolean;
  /** Family/household and independent-activity entries never suggest evidence is missing or needed. */
  evidenceOptionalWithNoNudge: boolean;
};

const BASE_VISIBILITY: ProjectContextFieldVisibility = {
  organizationRequired: false,
  showTeamFields: false,
  showEmploymentFields: false,
  suggestTeacherConfirmation: false,
  suggestOfficialResultLink: false,
  evidenceOptionalWithNoNudge: false,
};

/** Always returns a complete visibility object — an unrecognized context degrades to the least-demanding (personal-project-like) defaults, never to a locked-down/blocking state. */
export function getFieldVisibilityForContext(
  context: PortfolioItemProjectContext | null | undefined
): ProjectContextFieldVisibility {
  const normalized = normalizeProjectContext(context);

  switch (normalized) {
    case "organization_project":
      return { ...BASE_VISIBILITY, organizationRequired: true };
    case "school_project":
      return { ...BASE_VISIBILITY, organizationRequired: true, suggestTeacherConfirmation: true };
    case "team_project":
      return { ...BASE_VISIBILITY, showTeamFields: true };
    case "family_or_household":
      return { ...BASE_VISIBILITY, evidenceOptionalWithNoNudge: true };
    case "community_project":
      return { ...BASE_VISIBILITY, organizationRequired: false };
    case "employment":
      return { ...BASE_VISIBILITY, organizationRequired: true, showEmploymentFields: true };
    case "competition":
      return { ...BASE_VISIBILITY, suggestOfficialResultLink: true };
    case "course_or_program":
      return { ...BASE_VISIBILITY, organizationRequired: false, suggestTeacherConfirmation: true };
    case "independent_activity":
      return { ...BASE_VISIBILITY, evidenceOptionalWithNoNudge: true };
    case "personal_project":
    case "custom":
    case null:
    default:
      return { ...BASE_VISIBILITY, evidenceOptionalWithNoNudge: true };
  }
}

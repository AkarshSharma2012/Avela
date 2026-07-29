/**
 * Category template engine (spec section 5) — resolves any of the ~110
 * taxonomy categories to a full template: reworded prompts, suggested
 * evidence roles, which claim dimensions are realistically supportable,
 * and respectful "couldn't check this publicly" wording. One generic
 * resolution function, `resolveCategoryTemplate`, used for every category
 * including the go-kart example (spec section 4) — go-kart is data (an
 * override entry below), not a separate code path.
 *
 * Templates are built in two layers to avoid ~110 near-duplicate objects:
 *   1. GROUP_TEMPLATE_BASE — one entry per passion group (11), covering the
 *      large majority of categories in that group.
 *   2. CATEGORY_TEMPLATE_OVERRIDES — a sparse per-category patch, used only
 *      where a category genuinely needs different wording/evidence/
 *      dimensions than its group's default (go-kart chief among them).
 * A category with no override still gets a fully valid, category-labeled
 * template purely from its group's base — "content is data, resolution is
 * generic" holds at both layers.
 */

import { GENERIC_CATEGORY_FALLBACK, resolveCategory, type ActivityCategory, type PassionGroup } from "@/lib/portfolio/taxonomy";
import { getFieldVisibilityForContext } from "@/lib/portfolio/project-context";
import type { PortfolioFileEvidenceRole, PortfolioItemProjectContext } from "@/types/database";
import type { ClaimDimension } from "@/types/claims";

export type RequiredPrompts = {
  whatPrompt: string;
  whyPrompt: string;
  yourPartPrompt: string;
};

export type OptionalPromptKey =
  | "whoItHelped"
  | "materialsOrTools"
  | "collaborators"
  | "challenges"
  | "result"
  | "whatYouLearned"
  | "wouldImprove";

export type CategoryTemplate = {
  categoryKey: string;
  label: string;
  description: string;
  requiredPrompts: RequiredPrompts;
  /** Which of the 7 universal optional prompts this category suggests, and their reworded labels — order is display order. */
  optionalPrompts: readonly { key: OptionalPromptKey; label: string }[];
  suggestedEvidenceRoles: readonly PortfolioFileEvidenceRole[];
  /** Coarse relevance hint for the Phase 4 provider registry — providers self-declare their supported categories/groups; this just narrows which groups are worth checking first. */
  relevantProviderCategoryGroups: readonly PassionGroup[];
  publicLinkOptionUseful: boolean;
  verifierOptionUseful: boolean;
  supportableDimensions: readonly ClaimDimension[];
  /** Short, plain-language hints — never a hard gate — for claims that would need stronger evidence before being treated as strongly supported. */
  claimsRequiringStrongerEvidence: readonly string[];
  /** Whether an organization field is shown as required — always derived from the chosen project context, never hard-coded per category alone (a category never blocks saving by itself). */
  orgRequired: boolean;
  publicSourceCheckingUseful: boolean;
  /** Respectful wording shown when nothing could be publicly confirmed — never implies dishonesty. */
  unableToVerifyWording: string;
};

type GroupTemplateBase = Omit<CategoryTemplate, "categoryKey" | "label" | "orgRequired" | "description"> & {
  descriptionForLabel: (label: string) => string;
};

const DEFAULT_UNABLE_TO_VERIFY_WORDING =
  "We couldn't publicly confirm this one — that's normal for a lot of great work, and it doesn't count against you.";

const BASE_OPTIONAL_PROMPTS: Record<OptionalPromptKey, string> = {
  whoItHelped: "Who was it for, or who did it help?",
  materialsOrTools: "What materials, tools, or technology did you use?",
  collaborators: "Did anyone help you?",
  challenges: "What was challenging about it?",
  result: "How did it turn out?",
  whatYouLearned: "What did you learn?",
  wouldImprove: "What would you improve next time?",
};

function optionalPrompts(...keys: OptionalPromptKey[]): { key: OptionalPromptKey; label: string }[] {
  return keys.map((key) => ({ key, label: BASE_OPTIONAL_PROMPTS[key] }));
}

const GROUP_TEMPLATE_BASE: Record<PassionGroup, GroupTemplateBase> = {
  making_and_engineering: {
    descriptionForLabel: (label) => `A hands-on ${label.toLowerCase()} you built or worked on.`,
    requiredPrompts: { whatPrompt: "What did you build?", whyPrompt: "Why did you build it?", yourPartPrompt: "What part did you personally complete?" },
    optionalPrompts: optionalPrompts("materialsOrTools", "collaborators", "challenges", "result", "wouldImprove"),
    suggestedEvidenceRoles: ["concept_or_plan", "sketch_or_draft", "materials_or_tools", "work_in_progress", "final_artifact", "demonstration", "process_log"],
    relevantProviderCategoryGroups: ["making_and_engineering"],
    publicLinkOptionUseful: true,
    verifierOptionUseful: true,
    supportableDimensions: ["project_or_activity_exists", "authorship_or_contribution", "role", "dates_and_duration", "output_or_deliverable"],
    claimsRequiringStrongerEvidence: ["safety claims", "performance claims (e.g. speed, capability)"],
    publicSourceCheckingUseful: false,
    unableToVerifyWording: DEFAULT_UNABLE_TO_VERIFY_WORDING,
  },
  software_and_technology: {
    descriptionForLabel: (label) => `A ${label.toLowerCase()} you built or contributed to.`,
    requiredPrompts: { whatPrompt: "What did you build?", whyPrompt: "Why did you build it?", yourPartPrompt: "What part did you personally complete?" },
    optionalPrompts: optionalPrompts("materialsOrTools", "collaborators", "challenges", "result", "whatYouLearned"),
    suggestedEvidenceRoles: ["concept_or_plan", "code_or_source", "work_in_progress", "final_artifact", "demonstration", "data_or_results"],
    relevantProviderCategoryGroups: ["software_and_technology"],
    publicLinkOptionUseful: true,
    verifierOptionUseful: true,
    supportableDimensions: [
      "identity_control",
      "project_or_activity_exists",
      "account_or_asset_control",
      "authorship_or_contribution",
      "role",
      "dates_and_duration",
      "output_or_deliverable",
    ],
    claimsRequiringStrongerEvidence: ["sole-author claims on a team codebase", "usage or user-count claims"],
    publicSourceCheckingUseful: true,
    unableToVerifyWording: DEFAULT_UNABLE_TO_VERIFY_WORDING,
  },
  art_and_design: {
    descriptionForLabel: (label) => `A ${label.toLowerCase()} piece or body of work.`,
    requiredPrompts: { whatPrompt: "What did you create?", whyPrompt: "Why did you make it?", yourPartPrompt: "What part did you personally complete?" },
    optionalPrompts: optionalPrompts("materialsOrTools", "challenges", "result", "whatYouLearned", "wouldImprove"),
    suggestedEvidenceRoles: ["concept_or_plan", "sketch_or_draft", "work_in_progress", "final_artifact", "process_log"],
    relevantProviderCategoryGroups: ["art_and_design"],
    publicLinkOptionUseful: true,
    verifierOptionUseful: true,
    supportableDimensions: ["project_or_activity_exists", "authorship_or_contribution", "role", "dates_and_duration", "output_or_deliverable"],
    claimsRequiringStrongerEvidence: ["commissioned/paid claims", "sole-creator claims on a collaborative piece"],
    publicSourceCheckingUseful: true,
    unableToVerifyWording: DEFAULT_UNABLE_TO_VERIFY_WORDING,
  },
  music_and_audio: {
    descriptionForLabel: (label) => `A ${label.toLowerCase()} you performed, produced, or created.`,
    requiredPrompts: { whatPrompt: "What did you make or perform?", whyPrompt: "Why did you make it?", yourPartPrompt: "What part did you personally do?" },
    optionalPrompts: optionalPrompts("materialsOrTools", "collaborators", "challenges", "result", "whatYouLearned"),
    suggestedEvidenceRoles: ["concept_or_plan", "work_in_progress", "final_artifact", "performance", "demonstration"],
    relevantProviderCategoryGroups: ["music_and_audio"],
    publicLinkOptionUseful: true,
    verifierOptionUseful: true,
    supportableDimensions: ["project_or_activity_exists", "authorship_or_contribution", "role", "dates_and_duration", "output_or_deliverable"],
    claimsRequiringStrongerEvidence: ["sole-composer claims on a band piece", "commercial release claims"],
    publicSourceCheckingUseful: true,
    unableToVerifyWording: DEFAULT_UNABLE_TO_VERIFY_WORDING,
  },
  performing_arts: {
    descriptionForLabel: (label) => `A ${label.toLowerCase()} performance or role.`,
    requiredPrompts: { whatPrompt: "What did you perform or take part in?", whyPrompt: "Why did you do it?", yourPartPrompt: "What was your role?" },
    optionalPrompts: optionalPrompts("collaborators", "challenges", "result", "whatYouLearned"),
    suggestedEvidenceRoles: ["work_in_progress", "performance", "event_or_display", "supervisor_confirmation"],
    relevantProviderCategoryGroups: ["performing_arts", "writing_and_media"],
    publicLinkOptionUseful: true,
    verifierOptionUseful: true,
    supportableDimensions: ["project_or_activity_exists", "role", "dates_and_duration", "output_or_deliverable"],
    claimsRequiringStrongerEvidence: ["lead-role claims", "professional/paid-performance claims"],
    publicSourceCheckingUseful: false,
    unableToVerifyWording: DEFAULT_UNABLE_TO_VERIFY_WORDING,
  },
  writing_and_media: {
    descriptionForLabel: (label) => `A ${label.toLowerCase()} piece you wrote or produced.`,
    requiredPrompts: { whatPrompt: "What did you write or produce?", whyPrompt: "Why did you make it?", yourPartPrompt: "What part did you personally complete?" },
    optionalPrompts: optionalPrompts("collaborators", "challenges", "result", "whatYouLearned"),
    suggestedEvidenceRoles: ["concept_or_plan", "work_in_progress", "final_artifact", "publication", "code_or_source"],
    relevantProviderCategoryGroups: ["writing_and_media"],
    publicLinkOptionUseful: true,
    verifierOptionUseful: true,
    supportableDimensions: ["project_or_activity_exists", "authorship_or_contribution", "role", "dates_and_duration", "output_or_deliverable"],
    claimsRequiringStrongerEvidence: ["sole-author claims on a co-written piece", "paid-publication claims"],
    publicSourceCheckingUseful: true,
    unableToVerifyWording: DEFAULT_UNABLE_TO_VERIFY_WORDING,
  },
  science_and_academics: {
    descriptionForLabel: (label) => `A ${label.toLowerCase()} project.`,
    requiredPrompts: { whatPrompt: "What did you research or work on?", whyPrompt: "Why did you do it?", yourPartPrompt: "What part did you personally complete?" },
    optionalPrompts: optionalPrompts("materialsOrTools", "collaborators", "challenges", "result", "whatYouLearned"),
    suggestedEvidenceRoles: ["concept_or_plan", "research_or_notes", "data_or_results", "final_artifact", "publication"],
    relevantProviderCategoryGroups: ["science_and_academics"],
    publicLinkOptionUseful: true,
    verifierOptionUseful: true,
    supportableDimensions: ["project_or_activity_exists", "authorship_or_contribution", "role", "dates_and_duration", "output_or_deliverable", "award_or_credential"],
    claimsRequiringStrongerEvidence: ["award/placement claims", "sole-researcher claims on a team project"],
    publicSourceCheckingUseful: true,
    unableToVerifyWording: DEFAULT_UNABLE_TO_VERIFY_WORDING,
  },
  sports_and_competition: {
    descriptionForLabel: (label) => `${label} you took part in.`,
    requiredPrompts: { whatPrompt: "What did you do or compete in?", whyPrompt: "Why did you do it?", yourPartPrompt: "What was your role or result?" },
    optionalPrompts: optionalPrompts("collaborators", "challenges", "result", "whatYouLearned"),
    suggestedEvidenceRoles: ["performance", "official_result", "event_or_display", "coach_confirmation"],
    relevantProviderCategoryGroups: ["sports_and_competition"],
    publicLinkOptionUseful: true,
    verifierOptionUseful: true,
    supportableDimensions: ["project_or_activity_exists", "role", "dates_and_duration", "output_or_deliverable", "award_or_credential"],
    claimsRequiringStrongerEvidence: ["ranking/placement claims", "team-captain or starter-role claims"],
    publicSourceCheckingUseful: true,
    unableToVerifyWording: DEFAULT_UNABLE_TO_VERIFY_WORDING,
  },
  community_and_leadership: {
    descriptionForLabel: (label) => `${label} you took part in.`,
    requiredPrompts: { whatPrompt: "What did you do to help?", whyPrompt: "Why did you do it?", yourPartPrompt: "What was your role?" },
    optionalPrompts: optionalPrompts("whoItHelped", "collaborators", "challenges", "result", "whatYouLearned"),
    suggestedEvidenceRoles: ["work_in_progress", "event_or_display", "supervisor_confirmation", "customer_or_recipient_confirmation"],
    relevantProviderCategoryGroups: ["community_and_leadership"],
    publicLinkOptionUseful: true,
    verifierOptionUseful: true,
    supportableDimensions: ["project_or_activity_exists", "role", "dates_and_duration", "output_or_deliverable", "impact_or_outcome", "organization_relationship"],
    claimsRequiringStrongerEvidence: ["founder/organizer claims", "hours-served claims"],
    publicSourceCheckingUseful: false,
    unableToVerifyWording: DEFAULT_UNABLE_TO_VERIFY_WORDING,
  },
  business_and_entrepreneurship: {
    descriptionForLabel: (label) => `A ${label.toLowerCase()} venture.`,
    requiredPrompts: { whatPrompt: "What did you build or run?", whyPrompt: "Why did you start it?", yourPartPrompt: "What part did you personally do?" },
    optionalPrompts: optionalPrompts("whoItHelped", "collaborators", "challenges", "result", "whatYouLearned"),
    suggestedEvidenceRoles: ["concept_or_plan", "work_in_progress", "final_artifact", "receipt_or_material_record", "customer_or_recipient_confirmation"],
    relevantProviderCategoryGroups: ["business_and_entrepreneurship"],
    publicLinkOptionUseful: true,
    verifierOptionUseful: true,
    supportableDimensions: ["project_or_activity_exists", "authorship_or_contribution", "role", "dates_and_duration", "output_or_deliverable"],
    claimsRequiringStrongerEvidence: ["revenue/customer-count claims", "sole-founder claims"],
    publicSourceCheckingUseful: true,
    unableToVerifyWording: DEFAULT_UNABLE_TO_VERIFY_WORDING,
  },
  home_family_and_life_skills: {
    descriptionForLabel: (label) => `${label} you took on.`,
    // This group also backs GENERIC_CATEGORY_FALLBACK — its wording is
    // therefore spec section 3's literal universal default verbatim, not
    // just a home/family-specific rewording.
    requiredPrompts: { whatPrompt: "What did you do or make?", whyPrompt: "Why did you do it?", yourPartPrompt: "What part did you personally complete?" },
    optionalPrompts: optionalPrompts("whoItHelped", "challenges", "result", "whatYouLearned"),
    suggestedEvidenceRoles: ["work_in_progress", "final_artifact", "process_log", "reflection"],
    relevantProviderCategoryGroups: ["home_family_and_life_skills"],
    publicLinkOptionUseful: false,
    verifierOptionUseful: true,
    supportableDimensions: ["project_or_activity_exists", "role", "dates_and_duration"],
    claimsRequiringStrongerEvidence: [],
    publicSourceCheckingUseful: false,
    unableToVerifyWording:
      "This kind of work usually can't be checked publicly, and that's completely fine — it's counted the same either way.",
  },
};

/** Per-category patches — sparse by design. Any category absent here uses its group's base untouched. */
const CATEGORY_TEMPLATE_OVERRIDES: Partial<Record<string, Partial<GroupTemplateBase>>> = {
  // Go-kart (spec section 4) — a first-class fully-fleshed example, resolved
  // through the exact same generic engine as every other category.
  mechanical_build: {
    descriptionForLabel: () => "A mechanical build you designed and put together yourself.",
    requiredPrompts: { whatPrompt: "What did you build?", whyPrompt: "Why did you build it?", yourPartPrompt: "What part did you personally complete?" },
    optionalPrompts: optionalPrompts("materialsOrTools", "collaborators", "challenges", "result", "wouldImprove"),
    suggestedEvidenceRoles: [
      "concept_or_plan",
      "sketch_or_draft",
      "materials_or_tools",
      "work_in_progress",
      "final_artifact",
      "demonstration",
      "process_log",
      "possession_or_control",
      "collaborator_confirmation",
      "supervisor_confirmation",
      "code_or_source",
    ],
    relevantProviderCategoryGroups: ["making_and_engineering"],
    publicLinkOptionUseful: true,
    verifierOptionUseful: true,
    supportableDimensions: ["project_or_activity_exists", "authorship_or_contribution", "role", "dates_and_duration", "output_or_deliverable"],
    claimsRequiringStrongerEvidence: ["safety claims (e.g. \"street-legal\", \"crash-tested\")", "performance claims (e.g. top speed)"],
    publicSourceCheckingUseful: false,
    unableToVerifyWording: DEFAULT_UNABLE_TO_VERIFY_WORDING,
  },
  family_responsibility: {
    optionalPrompts: optionalPrompts("whoItHelped", "challenges", "whatYouLearned"),
  },
  open_source: {
    relevantProviderCategoryGroups: ["software_and_technology"],
    publicSourceCheckingUseful: true,
  },
};

function mergeGroupAndOverride(base: GroupTemplateBase, override: Partial<GroupTemplateBase> | undefined): GroupTemplateBase {
  if (!override) return base;
  return { ...base, ...override };
}

/** Never throws and never returns a template that blocks saving — an unknown category resolves through the same generic fallback category (taxonomy.ts) and its group's base. */
export function resolveCategoryTemplate(
  categoryKey: string | null | undefined,
  projectContext?: PortfolioItemProjectContext | null
): CategoryTemplate {
  const category: ActivityCategory = resolveCategory(categoryKey);
  const groupBase = mergeGroupAndOverride(GROUP_TEMPLATE_BASE[category.passionGroup], CATEGORY_TEMPLATE_OVERRIDES[category.key]);
  const visibility = getFieldVisibilityForContext(projectContext);

  return {
    categoryKey: category.key,
    label: category.label,
    description: groupBase.descriptionForLabel(category.label),
    requiredPrompts: groupBase.requiredPrompts,
    optionalPrompts: groupBase.optionalPrompts,
    suggestedEvidenceRoles: groupBase.suggestedEvidenceRoles,
    relevantProviderCategoryGroups: groupBase.relevantProviderCategoryGroups,
    publicLinkOptionUseful: groupBase.publicLinkOptionUseful,
    verifierOptionUseful: groupBase.verifierOptionUseful,
    supportableDimensions: groupBase.supportableDimensions,
    claimsRequiringStrongerEvidence: groupBase.claimsRequiringStrongerEvidence,
    orgRequired: visibility.organizationRequired || category.requiresOrgByDefault,
    publicSourceCheckingUseful: groupBase.publicSourceCheckingUseful,
    unableToVerifyWording: groupBase.unableToVerifyWording,
  };
}

/** Used directly only for a category that couldn't resolve at all (defensive; resolveCategoryTemplate already never fails). */
export const GENERIC_FALLBACK_TEMPLATE: CategoryTemplate = resolveCategoryTemplate(GENERIC_CATEGORY_FALLBACK.key, null);

import { describe, expect, it } from "vitest";

import { ACTIVITY_CATEGORIES, GENERIC_CATEGORY_FALLBACK } from "@/lib/portfolio/taxonomy";
import { PROJECT_CONTEXTS, getFieldVisibilityForContext } from "@/lib/portfolio/project-context";
import { GENERIC_FALLBACK_TEMPLATE, resolveCategoryTemplate } from "@/lib/portfolio/templates";
import { EVIDENCE_ROLE_LABELS } from "@/lib/portfolio/evidence-roles";
import { ALL_CLAIM_DIMENSIONS } from "@/lib/claims/constants";

describe("resolveCategoryTemplate", () => {
  it("resolves every one of the ~110 taxonomy categories to a valid template", () => {
    for (const category of ACTIVITY_CATEGORIES) {
      const template = resolveCategoryTemplate(category.key, null);
      expect(template.categoryKey).toBe(category.key);
      expect(template.label).toBe(category.label);
      expect(template.requiredPrompts.whatPrompt.length).toBeGreaterThan(0);
      expect(template.requiredPrompts.whyPrompt.length).toBeGreaterThan(0);
      expect(template.requiredPrompts.yourPartPrompt.length).toBeGreaterThan(0);
      expect(template.suggestedEvidenceRoles.length).toBeGreaterThan(0);
    }
  });

  it("only ever suggests real, known evidence roles", () => {
    for (const category of ACTIVITY_CATEGORIES) {
      const template = resolveCategoryTemplate(category.key, null);
      for (const role of template.suggestedEvidenceRoles) {
        expect(EVIDENCE_ROLE_LABELS[role]).toBeTruthy();
      }
    }
  });

  it("only ever lists real, known claim dimensions", () => {
    for (const category of ACTIVITY_CATEGORIES) {
      const template = resolveCategoryTemplate(category.key, null);
      for (const dimension of template.supportableDimensions) {
        expect(ALL_CLAIM_DIMENSIONS).toContain(dimension);
      }
    }
  });

  it("falls back to the generic template for an unknown/future category, never throwing", () => {
    const template = resolveCategoryTemplate("some_category_from_the_future", null);
    expect(template.categoryKey).toBe(GENERIC_CATEGORY_FALLBACK.key);
    expect(template).toEqual(GENERIC_FALLBACK_TEMPLATE);
  });

  it("falls back to the generic template for null/undefined input", () => {
    expect(resolveCategoryTemplate(null, null).categoryKey).toBe(GENERIC_CATEGORY_FALLBACK.key);
    expect(resolveCategoryTemplate(undefined, null).categoryKey).toBe(GENERIC_CATEGORY_FALLBACK.key);
  });

  it("agrees with project-context.ts's org-required visibility for every category/context pair", () => {
    for (const category of ACTIVITY_CATEGORIES) {
      for (const { value: context } of PROJECT_CONTEXTS) {
        const template = resolveCategoryTemplate(category.key, context);
        const visibility = getFieldVisibilityForContext(context);
        // A category can only ever *add* an org requirement on top of the
        // context's own rule, never remove one the context already set.
        if (visibility.organizationRequired) {
          expect(template.orgRequired).toBe(true);
        }
      }
    }
  });
});

describe("go-kart (mechanical_build) — spec section 4 example", () => {
  const template = resolveCategoryTemplate("mechanical_build", "personal_project");

  it("uses the exact three required prompts", () => {
    expect(template.requiredPrompts).toEqual({
      whatPrompt: "What did you build?",
      whyPrompt: "Why did you build it?",
      yourPartPrompt: "What part did you personally complete?",
    });
  });

  it("suggests the full range of physical-build evidence, including a possession challenge", () => {
    expect(template.suggestedEvidenceRoles).toEqual(
      expect.arrayContaining([
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
      ])
    );
  });

  it("never requires an organization for a personal project", () => {
    expect(template.orgRequired).toBe(false);
  });

  it("never suggests public-source checking (a go-kart has no public registry to check)", () => {
    expect(template.publicSourceCheckingUseful).toBe(false);
  });

  it("flags safety and performance claims as needing stronger evidence, without blocking the save", () => {
    expect(template.claimsRequiringStrongerEvidence.some((claim) => claim.includes("safety"))).toBe(true);
    expect(template.claimsRequiringStrongerEvidence.some((claim) => claim.includes("performance"))).toBe(true);
  });

  it("resolves through the same generic engine as every other category — go-kart is data, not a special-cased branch", () => {
    const paintingTemplate = resolveCategoryTemplate("painting", "personal_project");
    expect(typeof template).toBe(typeof paintingTemplate);
    expect(Object.keys(template).sort()).toEqual(Object.keys(paintingTemplate).sort());
  });
});

describe("family responsibility — never nudges for evidence", () => {
  it("has respectful unable-to-verify wording that never implies dishonesty", () => {
    const template = resolveCategoryTemplate("family_responsibility", "family_or_household");
    expect(template.unableToVerifyWording.toLowerCase()).not.toContain("fail");
    expect(template.unableToVerifyWording.toLowerCase()).not.toContain("suspicious");
    expect(template.claimsRequiringStrongerEvidence).toEqual([]);
  });
});

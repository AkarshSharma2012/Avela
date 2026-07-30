"use server";

/**
 * Server actions for the guided capture flow (spec Part 1). Thin wrappers
 * only — item creation/update itself always goes through the existing
 * createPortfolioItem/updatePortfolioItem actions
 * (src/lib/portfolio/actions.ts), never a second write path. This module
 * owns exactly two things the old long-form page didn't need: building a
 * draft from a Card 1 capture, and mapping that draft + the guided flow's
 * fields into the shapes those existing actions already expect.
 */

import { createPortfolioItem, updatePortfolioItem, type CreateItemResult, type PortfolioActionResult } from "@/lib/portfolio/actions";
import { buildCaptureDraft } from "@/lib/portfolio/capture/draft";
import type { CaptureDraft, CaptureInput } from "@/lib/portfolio/capture/types";
import { resolveCategory } from "@/lib/portfolio/taxonomy";
import type { PortfolioItemType } from "@/types/database";

export async function captureFromInputAction(input: CaptureInput): Promise<CaptureDraft> {
  return buildCaptureDraft(input);
}

export type GuidedSaveInput = {
  itemId: string | null;
  title: string;
  activityCategoryKey: string | null;
  organization: string | null;
  description: string;
  startDate: string | null;
  skills: string[];
  yourPart: string;
  whyYouDidIt: string;
};

/**
 * Called both mid-flow (autosave once the student reaches Card 3, spec's
 * "visible autosave state") and again on Card 5's explicit "Save to my
 * portfolio" — the second call is always an update of the same item, never
 * a second insert, so leaving and returning to the flow never creates
 * duplicates.
 */
export async function saveGuidedCaptureAction(input: GuidedSaveInput): Promise<CreateItemResult | PortfolioActionResult> {
  const category = resolveCategory(input.activityCategoryKey);
  const title = input.title.trim() || "Untitled item";

  const fields = {
    itemType: category.itemTypeBucket as PortfolioItemType,
    title,
    organization: input.organization?.trim() || null,
    description: input.description.trim() || null,
    startDate: input.startDate,
    skills: input.skills,
    activityCategoryKey: input.activityCategoryKey,
  };

  const narrative = {
    whatYouDid: input.description.trim() || title,
    whyYouDidIt: input.whyYouDidIt.trim() || "Not specified yet.",
    yourPart: input.yourPart.trim(),
  };

  if (input.itemId) {
    return updatePortfolioItem(input.itemId, fields);
  }

  return createPortfolioItem(fields, narrative);
}

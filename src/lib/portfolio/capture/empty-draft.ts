/**
 * Client-safe: the empty "Skip / start manually" draft (spec Part 1 Card
 * 1). Deliberately kept out of draft.ts — draft.ts's buildCaptureDraft
 * pulls in url-capture.ts, which imports checkUrl() from
 * src/lib/opportunities/url-safety.ts, which uses node:dns/promises.
 * Since ES modules bundle at file granularity, a client component
 * importing anything from draft.ts would drag that Node-only DNS code
 * into the browser bundle and fail to compile. This file has no such
 * dependency, so guided-capture-flow.tsx (a Client Component) imports
 * from here instead.
 */

import { getYourPartPrompt } from "@/lib/portfolio/capture/category-prompts";
import type { CaptureDraft } from "@/lib/portfolio/capture/types";

/**
 * Deliberately calls getYourPartPrompt(null) directly rather than resolving
 * a category first — GENERIC_CATEGORY_FALLBACK (taxonomy.ts) has a real
 * passionGroup ("home_family_and_life_skills", chosen for its item_type
 * bucket, not for prompt purposes), and resolving through it here would
 * show the family-specific prompt before the student has picked anything.
 */
export function emptyManualDraft(): CaptureDraft {
  return {
    title: { value: "", origin: "student" },
    activityCategoryKey: { value: null, origin: "student" },
    organization: { value: null, origin: "student" },
    description: { value: "", origin: "student" },
    startDate: { value: null, origin: "student" },
    skills: { value: [], origin: "student" },
    detectedEvidence: [],
    suggestedPersonalRolePrompt: getYourPartPrompt(null),
  };
}

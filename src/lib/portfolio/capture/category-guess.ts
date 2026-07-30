/**
 * Deterministic, keyword-based category suggestion for freeform capture
 * text (spec Part 1 Card 2's "proposed passion/category"). Never blocks
 * capture and never claims certainty — always a `suggested` FieldOrigin,
 * always freely overridable by the student. No AI call is involved; this
 * runs even when the AI grader is fully disabled.
 */

import { ACTIVITY_CATEGORIES, GENERIC_CATEGORY_FALLBACK, type ActivityCategory, type PassionGroup } from "@/lib/portfolio/taxonomy";

const PASSION_GROUP_KEYWORDS: Record<PassionGroup, readonly string[]> = {
  making_and_engineering: ["built", "build", "robot", "kart", "engine", "machine", "3d print", "circuit", "repair", "workshop", "prototype", "cad", "welding"],
  software_and_technology: ["code", "coding", "app", "software", "website", "repository", "repo", "github", "programmed", "developer", "algorithm", "database"],
  art_and_design: ["painting", "painted", "drew", "drawing", "sketch", "illustration", "sculpture", "design", "photography", "art"],
  music_and_audio: ["music", "song", "band", "instrument", "composed", "produced a track", "album", "orchestra", "choir"],
  performing_arts: ["theater", "theatre", "acting", "dance", "performed", "play", "musical"],
  writing_and_media: ["wrote", "writing", "essay", "blog", "journalism", "novel", "poem", "podcast", "film", "video edited"],
  science_and_academics: ["research", "experiment", "science fair", "lab", "study", "thesis", "paper"],
  sports_and_competition: ["team", "practice", "coach", "tournament", "trained", "athlete", "match", "season"],
  community_and_leadership: ["volunteer", "food drive", "organized", "fundraiser", "club president", "led a team", "community"],
  business_and_entrepreneurship: ["startup", "business", "sold", "customers", "revenue", "founded"],
  home_family_and_life_skills: ["sibling", "caregiving", "took care of", "family", "cooked", "household"],
};

function normalizedText(text: string): string {
  return text.toLowerCase();
}

export function guessPassionGroupFromText(text: string): PassionGroup | null {
  const lower = normalizedText(text);
  let best: { group: PassionGroup; hits: number } | null = null;
  for (const [group, keywords] of Object.entries(PASSION_GROUP_KEYWORDS) as [PassionGroup, readonly string[]][]) {
    const hits = keywords.filter((keyword) => lower.includes(keyword)).length;
    if (hits > 0 && (!best || hits > best.hits)) {
      best = { group, hits };
    }
  }
  return best?.group ?? null;
}

export function guessCategoryFromText(text: string): ActivityCategory {
  const group = guessPassionGroupFromText(text);
  if (!group) return GENERIC_CATEGORY_FALLBACK;
  const firstInGroup = ACTIVITY_CATEGORIES.find((c) => c.passionGroup === group);
  return firstInGroup ?? GENERIC_CATEGORY_FALLBACK;
}

/** GitHub/repo/URL captures skip keyword guessing and go straight to software — deterministic, not a heuristic guess. */
export function softwareCategory(): ActivityCategory {
  return ACTIVITY_CATEGORIES.find((c) => c.passionGroup === "software_and_technology") ?? GENERIC_CATEGORY_FALLBACK;
}

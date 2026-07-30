/**
 * Category-aware "Your Part" prompts (spec Part 1 Card 3). Keyed by
 * PassionGroup (taxonomy.ts) rather than the ~110 individual categories —
 * the spec's examples are all at this granularity ("Software", "Art",
 * "Sports", ...) and every category already maps to exactly one passion
 * group, so no new mapping table is needed.
 */

import type { PassionGroup } from "@/lib/portfolio/taxonomy";

export const YOUR_PART_PROMPTS: Record<PassionGroup, string> = {
  software_and_technology: "What code, design, research, or product decisions were yours?",
  making_and_engineering: "What did you personally design, build, test, or repair?",
  art_and_design: "What did you create, and what choices were yours?",
  music_and_audio: "Did you perform, compose, arrange, produce, or organize?",
  performing_arts: "Did you perform, direct, choreograph, or organize?",
  writing_and_media: "What did you write, edit, or produce yourself?",
  science_and_academics: "What did you personally research, test, analyze, or write?",
  community_and_leadership: "What decisions, planning, or coordination did you personally handle?",
  sports_and_competition: "What was your role, training commitment, contribution, or result?",
  business_and_entrepreneurship: "What did you personally build, decide, or run?",
  home_family_and_life_skills: "What recurring responsibility did you handle, and who depended on you?",
};

export const DEFAULT_YOUR_PART_PROMPT = "What part did you personally do?";

export function getYourPartPrompt(passionGroup: PassionGroup | null): string {
  if (!passionGroup) return DEFAULT_YOUR_PART_PROMPT;
  return YOUR_PART_PROMPTS[passionGroup] ?? DEFAULT_YOUR_PART_PROMPT;
}

/** Optional, clickable sentence starters (spec's Your Part screen: "optional sentence starters") — purely a writing nudge, never persisted separately from the free-text answer they get inserted into. */
export const YOUR_PART_STARTERS: Record<PassionGroup, string[]> = {
  software_and_technology: ["I designed and built…", "I wrote the code that…", "I made the decision to…"],
  making_and_engineering: ["I designed and built…", "I tested and fixed…", "I was responsible for…"],
  art_and_design: ["I created…", "I made the choice to…", "My style/technique was…"],
  music_and_audio: ["I performed…", "I composed/arranged…", "I produced/organized…"],
  performing_arts: ["I performed as…", "I directed/choreographed…", "I organized…"],
  writing_and_media: ["I wrote…", "I edited…", "I produced…"],
  science_and_academics: ["I researched…", "I analyzed…", "I wrote up…"],
  community_and_leadership: ["I planned…", "I coordinated…", "I decided…"],
  sports_and_competition: ["My role was…", "I trained by…", "My result was…"],
  business_and_entrepreneurship: ["I built…", "I decided…", "I ran…"],
  home_family_and_life_skills: ["I was responsible for…", "The people who depended on me were…", "I did this regularly by…"],
};

const DEFAULT_YOUR_PART_STARTERS = ["I was responsible for…", "I personally…", "The part that was mine was…"];

export function getYourPartStarters(passionGroup: PassionGroup | null): string[] {
  if (!passionGroup) return DEFAULT_YOUR_PART_STARTERS;
  return YOUR_PART_STARTERS[passionGroup] ?? DEFAULT_YOUR_PART_STARTERS;
}

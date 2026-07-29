/**
 * Universal activity taxonomy (Milestone 10.8, spec section 1) — ~110
 * student-facing categories across 11 passion areas, covering digital,
 * physical, creative, academic, athletic, community, family, and
 * entrepreneurial work equally. Deliberately a plain TS registry, not a DB
 * enum (see 20260813000000_activity_taxonomy_and_project_context.sql's
 * comment on activity_category_key) — adding a category here never requires
 * a migration.
 *
 * Every category maps to exactly one existing PortfolioItemType bucket
 * (itemTypeBucket) — the bucket src/lib/portfolio/strength.ts already scores
 * fairly (see strength-fairness.test.ts). This is deliberate: it's how "a
 * go-kart build scores equally to a coding project" holds true without
 * touching strength.ts at all — both simply become "project" items, and
 * strength.ts has never treated one item_type as worth more than another.
 *
 * Internal keys (activity_category_key values) are never shown to a
 * student — only `label` is. Unknown/future keys resolve through
 * `resolveCategory`'s fallback, never a thrown error or a blocked save.
 */

import type { PortfolioItemType } from "@/types/database";

export type PassionGroup =
  | "making_and_engineering"
  | "software_and_technology"
  | "art_and_design"
  | "music_and_audio"
  | "performing_arts"
  | "writing_and_media"
  | "science_and_academics"
  | "sports_and_competition"
  | "community_and_leadership"
  | "business_and_entrepreneurship"
  | "home_family_and_life_skills";

export const PASSION_GROUP_LABELS: Record<PassionGroup, string> = {
  making_and_engineering: "Making & Engineering",
  software_and_technology: "Software & Technology",
  art_and_design: "Art & Design",
  music_and_audio: "Music & Audio",
  performing_arts: "Performing Arts",
  writing_and_media: "Writing & Media",
  science_and_academics: "Science & Academics",
  sports_and_competition: "Sports & Competition",
  community_and_leadership: "Community & Leadership",
  business_and_entrepreneurship: "Business & Entrepreneurship",
  home_family_and_life_skills: "Home, Family & Life Skills",
};

export const PASSION_GROUPS: readonly PassionGroup[] = [
  "making_and_engineering",
  "software_and_technology",
  "art_and_design",
  "music_and_audio",
  "performing_arts",
  "writing_and_media",
  "science_and_academics",
  "sports_and_competition",
  "community_and_leadership",
  "business_and_entrepreneurship",
  "home_family_and_life_skills",
];

export type ActivityCategory = {
  /** Stored verbatim in portfolio_items.activity_category_key. Never shown to a student. */
  key: string;
  passionGroup: PassionGroup;
  /** Student-facing label — the only category text a student ever sees. */
  label: string;
  /** Which existing, fairly-scored PortfolioItemType bucket this category feeds into. */
  itemTypeBucket: PortfolioItemType;
  /**
   * A UI *suggestion* only for pre-selecting project context (spec section
   * 2) — never enforced. Real org-requirement logic always comes from the
   * student's chosen project_context, via project-context.ts.
   */
  requiresOrgByDefault: boolean;
};

/** Used for any activity_category_key that doesn't resolve to a known entry — a future category never breaks the app. */
export const GENERIC_CATEGORY_FALLBACK: ActivityCategory = {
  key: "custom_activity",
  passionGroup: "home_family_and_life_skills",
  label: "Something else",
  itemTypeBucket: "custom",
  requiresOrgByDefault: false,
};

function category(
  key: string,
  passionGroup: PassionGroup,
  label: string,
  itemTypeBucket: PortfolioItemType,
  requiresOrgByDefault = false
): ActivityCategory {
  return { key, passionGroup, label, itemTypeBucket, requiresOrgByDefault };
}

export const ACTIVITY_CATEGORIES: readonly ActivityCategory[] = [
  // ---------------------------------------------------------------------
  // Making and Engineering
  // ---------------------------------------------------------------------
  category("mechanical_build", "making_and_engineering", "Mechanical build", "project"),
  category("woodworking", "making_and_engineering", "Woodworking", "project"),
  category("electronics", "making_and_engineering", "Electronics", "project"),
  category("robotics", "making_and_engineering", "Robotics", "project"),
  category("engineering_prototype", "making_and_engineering", "Engineering prototype", "project"),
  category("automotive_or_bicycle", "making_and_engineering", "Automotive or bicycle project", "project"),
  category("three_d_printing", "making_and_engineering", "3D printing", "project"),
  category("repair_or_restoration", "making_and_engineering", "Repair or restoration", "project"),
  category("architecture_or_model", "making_and_engineering", "Architecture or model building", "project"),
  category("custom_maker_project", "making_and_engineering", "Another maker project", "project"),

  // ---------------------------------------------------------------------
  // Software and Technology
  // ---------------------------------------------------------------------
  category("coding", "software_and_technology", "Coding", "project"),
  category("web_or_app", "software_and_technology", "Website or app", "project"),
  category("game_development", "software_and_technology", "Game development", "project"),
  category("roblox_project", "software_and_technology", "Roblox project", "project"),
  category("data_or_ai", "software_and_technology", "Data or AI project", "project"),
  category("cybersecurity_project", "software_and_technology", "Cybersecurity project", "project"),
  category("automation", "software_and_technology", "Automation", "project"),
  category("open_source", "software_and_technology", "Open source contribution", "project"),
  category("hardware_software_project", "software_and_technology", "Hardware + software project", "project"),
  category("custom_technology_project", "software_and_technology", "Another technology project", "project"),

  // ---------------------------------------------------------------------
  // Art and Design
  // ---------------------------------------------------------------------
  category("painting", "art_and_design", "Painting", "project"),
  category("drawing", "art_and_design", "Drawing", "project"),
  category("digital_art", "art_and_design", "Digital art", "project"),
  category("graphic_design", "art_and_design", "Graphic design", "project"),
  category("sculpture", "art_and_design", "Sculpture", "project"),
  category("crafts", "art_and_design", "Crafts", "project"),
  category("photography", "art_and_design", "Photography", "project"),
  category("animation", "art_and_design", "Animation", "project"),
  category("fashion_design", "art_and_design", "Fashion design", "project"),
  category("custom_visual_art", "art_and_design", "Another visual art project", "project"),

  // ---------------------------------------------------------------------
  // Music and Audio
  // ---------------------------------------------------------------------
  category("music_performance", "music_and_audio", "Music performance", "project"),
  category("music_composition", "music_and_audio", "Music composition", "project"),
  category("music_production", "music_and_audio", "Music production", "project"),
  category("band_or_ensemble", "music_and_audio", "Band or ensemble", "activity"),
  category("singing", "music_and_audio", "Singing", "project"),
  category("instrument_learning", "music_and_audio", "Learning an instrument", "skill"),
  category("podcast", "music_and_audio", "Podcast", "project"),
  category("audio_engineering", "music_and_audio", "Audio engineering", "project"),
  category("dj_or_remix", "music_and_audio", "DJing or remixing", "project"),
  category("custom_music_project", "music_and_audio", "Another music project", "project"),

  // ---------------------------------------------------------------------
  // Performing Arts
  // ---------------------------------------------------------------------
  category("dance", "performing_arts", "Dance", "activity"),
  category("theater", "performing_arts", "Theater", "activity"),
  category("spoken_word", "performing_arts", "Spoken word", "activity"),
  category("comedy", "performing_arts", "Comedy", "activity"),
  category("stage_crew", "performing_arts", "Stage crew", "activity"),
  category("directing", "performing_arts", "Directing", "leadership"),
  category("choreography", "performing_arts", "Choreography", "project"),
  category("public_speaking", "performing_arts", "Public speaking", "skill"),
  category("performance_event", "performing_arts", "Performance event", "activity"),
  category("custom_performance", "performing_arts", "Another performance", "activity"),

  // ---------------------------------------------------------------------
  // Writing and Media
  // ---------------------------------------------------------------------
  category("creative_writing", "writing_and_media", "Creative writing", "project"),
  category("journalism", "writing_and_media", "Journalism", "project"),
  category("article_or_blog", "writing_and_media", "Article or blog", "project"),
  category("poetry", "writing_and_media", "Poetry", "project"),
  category("short_story", "writing_and_media", "Short story", "project"),
  category("publishing", "writing_and_media", "Publishing", "project"),
  category("film", "writing_and_media", "Film", "project"),
  category("documentary", "writing_and_media", "Documentary", "project"),
  category("video_creation", "writing_and_media", "Video creation", "project"),
  category("custom_media_project", "writing_and_media", "Another writing or media project", "project"),

  // ---------------------------------------------------------------------
  // Science and Academics
  // ---------------------------------------------------------------------
  category("science_experiment", "science_and_academics", "Science experiment", "project"),
  category("research", "science_and_academics", "Research", "project"),
  category("science_fair", "science_and_academics", "Science fair", "project"),
  category("mathematics", "science_and_academics", "Mathematics", "skill"),
  category("academic_competition", "science_and_academics", "Academic competition", "activity"),
  category("independent_study", "science_and_academics", "Independent study", "course"),
  category("language_learning", "science_and_academics", "Language learning", "skill"),
  category("translation", "science_and_academics", "Translation", "project"),
  category("historical_research", "science_and_academics", "Historical research", "project"),
  category("custom_academic_project", "science_and_academics", "Another academic project", "project"),

  // ---------------------------------------------------------------------
  // Sports and Competition
  // ---------------------------------------------------------------------
  category("team_sport", "sports_and_competition", "Team sport", "activity"),
  category("individual_sport", "sports_and_competition", "Individual sport", "activity"),
  category("martial_arts", "sports_and_competition", "Martial arts", "activity"),
  category("fitness_training", "sports_and_competition", "Fitness training", "activity"),
  category("outdoor_activity", "sports_and_competition", "Outdoor activity", "activity"),
  category("chess", "sports_and_competition", "Chess", "activity"),
  category("debate", "sports_and_competition", "Debate", "activity"),
  category("esports", "sports_and_competition", "Esports", "activity"),
  category("coaching", "sports_and_competition", "Coaching", "leadership"),
  category("custom_competition", "sports_and_competition", "Another competition", "activity"),

  // ---------------------------------------------------------------------
  // Community and Leadership
  // ---------------------------------------------------------------------
  category("community_service", "community_and_leadership", "Community service", "volunteer_service"),
  category("informal_volunteering", "community_and_leadership", "Informal volunteering", "volunteer_service"),
  category("nonprofit_volunteering", "community_and_leadership", "Nonprofit volunteering", "volunteer_service", true),
  category("tutoring", "community_and_leadership", "Tutoring", "volunteer_service"),
  category("mentoring", "community_and_leadership", "Mentoring", "volunteer_service"),
  category("leadership", "community_and_leadership", "Leadership role", "leadership"),
  category("club_activity", "community_and_leadership", "Club activity", "activity"),
  category("event_organization", "community_and_leadership", "Event organization", "leadership"),
  category("advocacy", "community_and_leadership", "Advocacy", "leadership"),
  category("custom_community_work", "community_and_leadership", "Other community work", "volunteer_service"),

  // ---------------------------------------------------------------------
  // Business and Entrepreneurship
  // ---------------------------------------------------------------------
  category("entrepreneurship", "business_and_entrepreneurship", "Entrepreneurship", "project"),
  category("small_business", "business_and_entrepreneurship", "Small business", "project"),
  category("online_store", "business_and_entrepreneurship", "Online store", "project"),
  category("product_design", "business_and_entrepreneurship", "Product design", "project"),
  category("service_business", "business_and_entrepreneurship", "Service business", "project"),
  category("baking_business", "business_and_entrepreneurship", "Baking business", "project"),
  category("freelance_work", "business_and_entrepreneurship", "Freelance work", "work_experience"),
  category("fundraising", "business_and_entrepreneurship", "Fundraising", "leadership"),
  category("market_research", "business_and_entrepreneurship", "Market research", "project"),
  category("custom_business_project", "business_and_entrepreneurship", "Another business project", "project"),

  // ---------------------------------------------------------------------
  // Home, Family, and Life Skills
  // ---------------------------------------------------------------------
  category("family_responsibility", "home_family_and_life_skills", "Family responsibility", "activity"),
  category("caregiving", "home_family_and_life_skills", "Caregiving", "activity"),
  category("cooking", "home_family_and_life_skills", "Cooking", "activity"),
  category("baking", "home_family_and_life_skills", "Baking", "activity"),
  category("gardening", "home_family_and_life_skills", "Gardening", "activity"),
  category("animal_care", "home_family_and_life_skills", "Animal care", "activity"),
  category("household_management", "home_family_and_life_skills", "Household management", "activity"),
  category("family_business_help", "home_family_and_life_skills", "Helping with a family business", "work_experience"),
  category("cultural_activity", "home_family_and_life_skills", "Cultural activity", "activity"),
  category("independent_learning", "home_family_and_life_skills", "Independent learning", "skill"),
];

const CATEGORY_BY_KEY: ReadonlyMap<string, ActivityCategory> = new Map(
  ACTIVITY_CATEGORIES.map((entry) => [entry.key, entry])
);

/** Never throws and never returns null — an unrecognized or future key always resolves to a safe generic fallback. */
export function resolveCategory(categoryKey: string | null | undefined): ActivityCategory {
  if (!categoryKey) return GENERIC_CATEGORY_FALLBACK;
  return CATEGORY_BY_KEY.get(categoryKey) ?? GENERIC_CATEGORY_FALLBACK;
}

export function listCategoriesByPassionGroup(passionGroup: PassionGroup): readonly ActivityCategory[] {
  return ACTIVITY_CATEGORIES.filter((entry) => entry.passionGroup === passionGroup);
}

export function isKnownCategory(categoryKey: string | null | undefined): boolean {
  return !!categoryKey && CATEGORY_BY_KEY.has(categoryKey);
}

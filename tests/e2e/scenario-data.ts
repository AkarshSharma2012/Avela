/**
 * The 35-scenario matrix (spec section 17) — one row per scenario, mapped
 * to a real taxonomy category/context so expectations (org-requirement,
 * evidence-role suggestions, provider relevance) are derived at run time
 * from the actual template/registry functions in
 * portfolio-scenarios.spec.ts, not hand-duplicated here. Covers every one
 * of the 12 provider passion areas (spec section 18: "cover at least one
 * scenario from every provider passion area") and every one of the 6
 * personas at least once.
 */

import type { E2ePersonaKey } from "../../src/lib/e2e/personas";
import type { PortfolioItemProjectContext } from "../../src/types/database";

export type ScenarioCase = {
  name: string;
  personaKey: E2ePersonaKey;
  categoryKey: string;
  context: PortfolioItemProjectContext;
  title: string;
  /** A representative subset also gets a mobile-viewport pass (spec section 17/18) — not all 35, to avoid needless duplication. */
  checkMobileLayout?: boolean;
};

export const SCENARIOS: readonly ScenarioCase[] = [
  { name: "Personal go-kart build", personaKey: "maker_engineering", categoryKey: "mechanical_build", context: "personal_project", title: "My go-kart", checkMobileLayout: true },
  { name: "Wooden table", personaKey: "maker_engineering", categoryKey: "woodworking", context: "personal_project", title: "A wooden table" },
  { name: "Painting", personaKey: "artist_performer", categoryKey: "painting", context: "personal_project", title: "A watercolor series", checkMobileLayout: true },
  { name: "Digital illustration", personaKey: "artist_performer", categoryKey: "digital_art", context: "independent_activity", title: "A digital illustration set" },
  { name: "Photography portfolio", personaKey: "artist_performer", categoryKey: "photography", context: "independent_activity", title: "A photography portfolio" },
  { name: "Music performance", personaKey: "artist_performer", categoryKey: "music_performance", context: "school_project", title: "Spring concert performance" },
  { name: "Original music production", personaKey: "artist_performer", categoryKey: "music_production", context: "personal_project", title: "An original track" },
  { name: "Dance performance", personaKey: "artist_performer", categoryKey: "dance", context: "school_project", title: "Fall dance recital" },
  { name: "Theater production", personaKey: "artist_performer", categoryKey: "theater", context: "school_project", title: "School play" },
  { name: "Short film", personaKey: "digital_creator", categoryKey: "film", context: "independent_activity", title: "A short film" },
  { name: "Podcast", personaKey: "digital_creator", categoryKey: "podcast", context: "independent_activity", title: "A podcast series", checkMobileLayout: true },
  { name: "Short story or article", personaKey: "digital_creator", categoryKey: "article_or_blog", context: "independent_activity", title: "A published article" },
  { name: "Science experiment", personaKey: "athlete_academic_competitor", categoryKey: "science_experiment", context: "school_project", title: "A science fair experiment" },
  { name: "Research project", personaKey: "athlete_academic_competitor", categoryKey: "historical_research", context: "independent_activity", title: "An independent research project" },
  { name: "Robotics project", personaKey: "maker_engineering", categoryKey: "robotics", context: "team_project", title: "A robotics competition build", checkMobileLayout: true },
  { name: "Electronics build", personaKey: "maker_engineering", categoryKey: "electronics", context: "personal_project", title: "A custom electronics build" },
  { name: "3D-printed prototype", personaKey: "maker_engineering", categoryKey: "three_d_printing", context: "personal_project", title: "A 3D-printed prototype" },
  { name: "Website or app", personaKey: "digital_creator", categoryKey: "web_or_app", context: "personal_project", title: "A personal website" },
  { name: "Roblox or game project", personaKey: "digital_creator", categoryKey: "roblox_project", context: "personal_project", title: "A Roblox game" },
  { name: "Team coding project", personaKey: "digital_creator", categoryKey: "coding", context: "team_project", title: "A team-built app", checkMobileLayout: true },
  { name: "School club leadership", personaKey: "community_leadership", categoryKey: "advocacy", context: "school_project", title: "Leading the robotics club" },
  { name: "Community food drive", personaKey: "community_leadership", categoryKey: "event_organization", context: "community_project", title: "Organized a food drive" },
  { name: "Informal tutoring", personaKey: "community_leadership", categoryKey: "tutoring", context: "independent_activity", title: "Tutoring a neighbor" },
  { name: "Formal nonprofit volunteering", personaKey: "community_leadership", categoryKey: "nonprofit_volunteering", context: "organization_project", title: "Volunteering at a food bank" },
  { name: "Family caregiving", personaKey: "family_independent_learner", categoryKey: "caregiving", context: "family_or_household", title: "Caring for my grandmother", checkMobileLayout: true },
  { name: "Small baking business", personaKey: "family_independent_learner", categoryKey: "baking_business", context: "personal_project", title: "A small baking business" },
  { name: "Sewing or fashion project", personaKey: "artist_performer", categoryKey: "fashion_design", context: "personal_project", title: "A sewn garment" },
  { name: "Gardening or environmental project", personaKey: "family_independent_learner", categoryKey: "gardening", context: "independent_activity", title: "A backyard garden" },
  { name: "Sports team participation", personaKey: "athlete_academic_competitor", categoryKey: "team_sport", context: "school_project", title: "Varsity soccer season", checkMobileLayout: true },
  { name: "Individual athletic training", personaKey: "athlete_academic_competitor", categoryKey: "individual_sport", context: "independent_activity", title: "Marathon training" },
  { name: "Chess, debate, or academic competition", personaKey: "athlete_academic_competitor", categoryKey: "chess", context: "competition", title: "Regional chess tournament" },
  { name: "Language or cultural project", personaKey: "family_independent_learner", categoryKey: "language_learning", context: "independent_activity", title: "Learning Mandarin" },
  { name: "Animal care or fostering", personaKey: "family_independent_learner", categoryKey: "animal_care", context: "family_or_household", title: "Fostering rescue dogs" },
  { name: "Restoration or repair project", personaKey: "maker_engineering", categoryKey: "repair_or_restoration", context: "personal_project", title: "Restored bicycle" },
  { name: "Custom activity", personaKey: "digital_creator", categoryKey: "some_future_activity_not_in_the_taxonomy_yet", context: "custom", title: "Something else entirely", checkMobileLayout: true },
];

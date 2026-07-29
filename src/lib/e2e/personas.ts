/**
 * The six E2E personas (spec section 16) — pure data, each pointing at a
 * representative taxonomy category so seed.ts and the Playwright scenarios
 * (Phase 10) can create a realistic starting item without hand-writing one
 * per persona twice.
 */

export type E2ePersonaKey =
  | "digital_creator"
  | "maker_engineering"
  | "artist_performer"
  | "community_leadership"
  | "athlete_academic_competitor"
  | "family_independent_learner";

export type E2ePersona = {
  key: E2ePersonaKey;
  label: string;
  sampleCategoryKey: string;
  sampleItemTitle: string;
};

export const E2E_PERSONAS: readonly E2ePersona[] = [
  { key: "digital_creator", label: "Digital creator", sampleCategoryKey: "web_or_app", sampleItemTitle: "A personal website project" },
  { key: "maker_engineering", label: "Maker or engineering student", sampleCategoryKey: "mechanical_build", sampleItemTitle: "A go-kart build" },
  { key: "artist_performer", label: "Artist or performer", sampleCategoryKey: "painting", sampleItemTitle: "A watercolor series" },
  { key: "community_leadership", label: "Community or leadership student", sampleCategoryKey: "leadership", sampleItemTitle: "Leading a school club" },
  { key: "athlete_academic_competitor", label: "Athlete or academic competitor", sampleCategoryKey: "team_sport", sampleItemTitle: "Varsity soccer season" },
  { key: "family_independent_learner", label: "Family-responsibility or independent-learning student", sampleCategoryKey: "family_responsibility", sampleItemTitle: "Caring for younger siblings" },
];

export function findE2ePersona(key: E2ePersonaKey): E2ePersona {
  const persona = E2E_PERSONAS.find((entry) => entry.key === key);
  if (!persona) throw new Error(`Unknown E2E persona key: ${key}`);
  return persona;
}

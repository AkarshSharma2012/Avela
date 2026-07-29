/**
 * Creates temporary E2E personas (spec section 16) — service-role only,
 * gated by requireE2eTestUsersAllowed(). Every created user is marked with
 * `user_metadata: { e2e_test: true, persona }` and a synthetic
 * @e2e.avela.invalid email; every seeded portfolio item's title carries the
 * "[E2E TEST] " prefix. Credentials are returned only in-memory to the
 * caller — never logged, never written to a file, unless the caller
 * explicitly opts into `reveal` (and even then, only outside production).
 */

import { resolveCategory } from "@/lib/portfolio/taxonomy";
import { createE2eServiceRoleClient, generateE2eEmail, generateE2ePassword, requireE2eTestUsersAllowed, E2E_TITLE_PREFIX } from "@/lib/e2e/config";
import { E2E_PERSONAS, type E2ePersona, type E2ePersonaKey } from "@/lib/e2e/personas";

export type SeededE2ePersona = {
  persona: E2ePersona;
  userId: string;
  email: string;
  /** Only ever populated in-memory for this one call — never persisted or logged by this module. */
  password: string;
  sampleItemId: string | null;
};

export type SeedE2ePersonasOptions = {
  /** Defaults to all 6. Pass a subset for a targeted scenario run. */
  personaKeys?: readonly E2ePersonaKey[];
  /** Also creates one sample portfolio item per persona (title prefixed, category/context/narrative filled in). Defaults to true. */
  withSampleItem?: boolean;
};

/** Never throws for a single persona's failure — returns as many seeded personas as actually succeeded, so a partial failure never leaves the caller unable to clean up the ones that did succeed. */
export async function seedE2ePersonas(options: SeedE2ePersonasOptions = {}): Promise<{ seeded: SeededE2ePersona[]; errors: string[] }> {
  requireE2eTestUsersAllowed();
  const supabase = createE2eServiceRoleClient();

  const personas = options.personaKeys
    ? E2E_PERSONAS.filter((persona) => options.personaKeys!.includes(persona.key))
    : E2E_PERSONAS;
  const withSampleItem = options.withSampleItem ?? true;

  const seeded: SeededE2ePersona[] = [];
  const errors: string[] = [];

  for (const persona of personas) {
    const email = generateE2eEmail(persona.key);
    const password = generateE2ePassword();

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { e2e_test: true, persona: persona.key },
    });
    if (error || !data.user) {
      errors.push(`${persona.key}: ${error?.message ?? "user creation failed"}`);
      continue;
    }

    // The handle_new_user() trigger creates the profiles row automatically,
    // but onboarding_completed defaults false — every real signup lands on
    // /onboarding first. These personas exist to test the portfolio flow,
    // not onboarding, so mark it complete immediately rather than driving
    // the browser through an unrelated form on every scenario.
    const { error: onboardingError } = await supabase
      .from("profiles")
      .update({ onboarding_completed: true, display_name: persona.label, grade_level: 11 })
      .eq("id", data.user.id);
    if (onboardingError) {
      errors.push(`${persona.key}: onboarding setup failed — ${onboardingError.message}`);
    }

    let sampleItemId: string | null = null;
    if (withSampleItem) {
      const category = resolveCategory(persona.sampleCategoryKey);
      const { data: item, error: itemError } = await supabase
        .from("portfolio_items")
        .insert({
          user_id: data.user.id,
          item_type: category.itemTypeBucket,
          title: `${E2E_TITLE_PREFIX}${persona.sampleItemTitle}`,
          activity_category_key: persona.sampleCategoryKey,
          project_context: "personal_project",
        })
        .select("id")
        .single();
      if (itemError) {
        errors.push(`${persona.key}: sample item creation failed — ${itemError.message}`);
      } else {
        sampleItemId = item.id;
      }
    }

    seeded.push({ persona, userId: data.user.id, email, password, sampleItemId });
  }

  return { seeded, errors };
}

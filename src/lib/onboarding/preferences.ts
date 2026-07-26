import { PREFERENCE_GROUPS } from "@/lib/onboarding/constants";
import type { OpportunityPreferenceKey } from "@/types/database";

export type PreferenceDescription = {
  groupLabel: string;
  optionLabel: string;
};

/**
 * Maps saved `student_opportunity_preferences` keys back to their
 * human-readable group + option labels, in `PREFERENCE_GROUPS` order, for
 * display on the profile page. Unknown keys are silently ignored rather
 * than throwing, since this reads already-validated database rows.
 */
export function describePreferences(
  keys: readonly OpportunityPreferenceKey[]
): PreferenceDescription[] {
  const descriptions: PreferenceDescription[] = [];

  for (const group of PREFERENCE_GROUPS) {
    for (const option of group.options) {
      if (keys.includes(option.value)) {
        descriptions.push({ groupLabel: group.label, optionLabel: option.label });
      }
    }
  }

  return descriptions;
}

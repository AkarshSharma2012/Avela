"use server";

import { createClient } from "@/lib/supabase/server";
import { completeOnboarding } from "@/lib/onboarding/complete";
import { parseOnboardingFormData } from "@/lib/onboarding/draft";

export type SubmitOnboardingState = {
  error?: string;
  success?: boolean;
};

/**
 * Final-step Server Action, bound to a real `<form action={formAction}>`
 * (see `OnboardingWizard`) so React dispatches it inside a transition
 * automatically — calling the `useActionState` dispatch manually from an
 * `onClick` throws "called outside of a transition" and never reaches this
 * function at all, which was the Milestone 2 completion bug.
 *
 * Re-validates the whole onboarding payload server-side (never trust the
 * client, even though the wizard already validated each step) and saves it
 * via the `complete_onboarding` RPC, which does the update +
 * replace-join-rows + `onboarding_completed = true` atomically.
 *
 * Returns `{ success: true }` rather than redirecting itself, so the client
 * component can clear the locally-saved draft before navigating — a plain
 * `redirect()` here would unmount the wizard before that cleanup ran.
 */
export async function submitOnboarding(
  _prevState: SubmitOnboardingState,
  formData: FormData
): Promise<SubmitOnboardingState> {
  const supabase = await createClient();

  const result = await completeOnboarding(parseOnboardingFormData(formData), async (args) => {
    const { error } = await supabase.rpc("complete_onboarding", args);
    return { error };
  });

  if (!result.success) {
    return { error: result.error };
  }

  return { success: true };
}

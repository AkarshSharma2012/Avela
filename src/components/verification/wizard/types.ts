/**
 * The Step 1 cards (spec section 12 / Milestone 10.7 redesign, extended in
 * Milestone 10.8 spec section 6) — "later" closes the wizard rather than
 * advancing it. "show_process" reuses the same evidence-upload step as
 * "add_files" (process photos/logs are just evidence with a process
 * framing) rather than duplicating a whole new step component.
 */
export type SupportMethod = "connect_account" | "add_files" | "add_link" | "ask_confirm" | "show_process" | "later";

export type WizardStep = 1 | 2 | 3 | 4;

export const TOTAL_STEPS = 4;

export type WizardPersistedState = {
  open: boolean;
  step: WizardStep;
  method: SupportMethod | null;
};

export function defaultWizardState(): WizardPersistedState {
  return { open: false, step: 1, method: null };
}

export function wizardStorageKey(itemId: string): string {
  return `avela:support-wizard:${itemId}`;
}
